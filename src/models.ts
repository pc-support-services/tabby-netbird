export interface NetBirdPeer {
    id: string
    name: string
    dns_label: string
    hostname: string
    ip: string
    connected: boolean
    groups?: { id: string, name: string }[]
    os?: string
}

export interface NetBirdGroup {
    id: string
    name: string
    user?: string
    // Prefer a FileProvidersService reference (e.g. file://... or vault://...).
    // Legacy raw paths (without ://) are still accepted for backward compatibility.
    privateKey?: string
    // Opaque VaultService marker (e.g. vault:group-password:...), never plaintext.
    password?: string
}

export interface NetBirdRule {
    id: string
    description?: string    // free-text note, purely for your own reference - has no effect on matching
    nameRegex?: string      // regex against peer name (falls back to hostname/dns label)
    groupRegex?: string     // regex against the peer's comma-joined NetBird group names
    onlineStatus?: 'online' | 'offline'    // unset = match regardless of online status
    exclude?: boolean
    group?: string      // references a NetBirdGroup.name; supports $1, $2... from nameRegex capture groups
    user?: string
    // Prefer a FileProvidersService reference (e.g. file://... or vault://...).
    // Legacy raw paths (without ://) are still accepted for backward compatibility.
    privateKey?: string
    // Opaque VaultService marker (e.g. vault:rule-password:...), never plaintext.
    password?: string
    showGroupsInName?: boolean    // append the peer's other NetBird groups (minus excludes) to its profile name
}

export interface NetBirdSettings {
    managementUrl: string       // e.g. https://netbird.example.com
    patRef?: string             // opaque VaultService marker for the PAT (never plaintext)
    patPlain?: string           // plaintext PAT, for setups without the Vault enabled
    groups: NetBirdGroup[]
    rules: NetBirdRule[]
    onlyGrouped: boolean        // only list peers that have at least one group
    groupLabelExcludes: string[]   // group names never shown by showGroupsInName
    showOfflineSuffix: boolean  // append "(offline)" to offline peers' names
}

export interface ResolvedPeerSettings {
    excluded: boolean
    group?: string
    user?: string
    privateKey?: string
    password?: string
    showGroupsInName?: boolean
}

export const DEFAULT_GROUP = 'NetBird'
export const DEFAULT_USER = undefined  // no default user - prompt at connect time
export const GROUP_PASSWORD_SECRET_TYPE = 'netbird:group-password'
export const RULE_PASSWORD_SECRET_TYPE = 'netbird:rule-password'
export const PAT_SECRET_TYPE = 'netbird:pat'
const GROUP_PASSWORD_REF_PREFIX = 'vault:group-password:'
const RULE_PASSWORD_REF_PREFIX = 'vault:rule-password:'
const PAT_REF_PREFIX = 'vault:pat:'

export function newId (): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function groupPasswordRef (id: string): string {
    return `${GROUP_PASSWORD_REF_PREFIX}${id}`
}

export function rulePasswordRef (id: string): string {
    return `${RULE_PASSWORD_REF_PREFIX}${id}`
}

export const patSecretRef = patRef
export function patRef (): string {
    return `${PAT_REF_PREFIX}${PAT_SECRET_TYPE}`
}

export function passwordSecretFromRef (ref?: string): { type: string, key: { id: string } } | null {
    if (!ref) {
        return null
    }
    if (ref.startsWith(GROUP_PASSWORD_REF_PREFIX)) {
        return {
            type: GROUP_PASSWORD_SECRET_TYPE,
            key: { id: ref.substring(GROUP_PASSWORD_REF_PREFIX.length) },
        }
    }
    if (ref.startsWith(RULE_PASSWORD_REF_PREFIX)) {
        return {
            type: RULE_PASSWORD_SECRET_TYPE,
            key: { id: ref.substring(RULE_PASSWORD_REF_PREFIX.length) },
        }
    }
    if (ref.startsWith(PAT_REF_PREFIX)) {
        return {
            type: PAT_SECRET_TYPE,
            key: { id: PAT_SECRET_TYPE },
        }
    }
    return null
}

/**
 * The peer's NetBird FQDN label (e.g. "myhost.netbird.selfhosted"),
 * stripped at the first dot to the host part; falls back to the plain
 * hostname or name reported by the management API.
 */
export function peerLabel (peer: NetBirdPeer): string {
    const fqdn = peer.dns_label || ''
    if (fqdn) { return fqdn.split('.')[0] }
    return peer.hostname || peer.name || ''
}

/**
 * The peer's group names, minus any name in `excludes` (case-insensitive) -
 * used to build the "(...)" suffix that showGroupsInName appends.
 */
export function peerLabelGroups (peer: NetBirdPeer, excludes: string[]): string[] {
    const excludeSet = new Set(excludes.map(t => t.toLowerCase()))
    return (peer.groups ?? [])
        .map(g => g.name)
        .filter(n => !excludeSet.has((n ?? '').toLowerCase()))
}

/**
 * Returns a human-readable error if `pattern` isn't a valid JS regex, or
 * null if it's fine (including empty/undefined, which just means "no filter").
 */
export function regexError (pattern?: string): string | null {
    if (!pattern) { return null }
    try {
        new RegExp(pattern)
        return null
    } catch (e) {
        return e instanceof Error ? e.message : String(e)
    }
}

/**
 * Resolves a peer's group/user/privateKey/password by cascading matching rules
 * (later matches override earlier ones, top to bottom), then falling back
 * to the resolved group's own defaults, then to hardcoded defaults.
 */
export function applyRules (peer: NetBirdPeer, rules: NetBirdRule[], groups: NetBirdGroup[]): ResolvedPeerSettings {
    const label = peerLabel(peer)
    const peerGroupNames = (peer.groups ?? []).map(g => g.name).join(',')

    const result: ResolvedPeerSettings = { excluded: false }

    for (const rule of rules) {
        let nameMatch: RegExpExecArray | null = null

        if (rule.onlineStatus === 'online' && !peer.connected) { continue }
        if (rule.onlineStatus === 'offline' && peer.connected) { continue }

        if (rule.nameRegex) {
            try {
                nameMatch = new RegExp(rule.nameRegex, 'i').exec(label)
            } catch (e) {
                console.warn(`tabby-netbird: rule ${rule.id} has an invalid name regex (${rule.nameRegex}) - skipping rule`, e)
                continue
            }
            if (!nameMatch) { continue }
        }
        if (rule.groupRegex) {
            try {
                if (!new RegExp(rule.groupRegex, 'i').test(peerGroupNames)) { continue }
            } catch (e) {
                console.warn(`tabby-netbird: rule ${rule.id} has an invalid group regex (${rule.groupRegex}) - skipping rule`, e)
                continue
            }
        }

        // `exclude` cascades like every other field below - a later matching
        // rule with the checkbox explicitly unchecked (exclude: false) can
        // un-exclude a peer an earlier rule excluded. Only an explicit true
        // or false counts; leaving it unset means "don't touch".
        if (rule.exclude !== undefined) {
            result.excluded = rule.exclude
        }

        if (rule.group) {
            result.group = rule.group.replace(/$(\d+)/g, (_, i) => nameMatch?.[+i] ?? '')
        }
        if (rule.user) { result.user = rule.user }
        if (rule.privateKey) { result.privateKey = rule.privateKey }
        if (rule.password) { result.password = rule.password }
        if (rule.showGroupsInName !== undefined) { result.showGroupsInName = rule.showGroupsInName }
    }

    if (!result.excluded) {
        const group = result.group ? groups.find(g => g.name === result.group) : undefined
        if (group) {
            result.user ??= group.user
            result.privateKey ??= group.privateKey
            result.password ??= group.password
        }
        result.group ??= DEFAULT_GROUP
    }

    return result
}