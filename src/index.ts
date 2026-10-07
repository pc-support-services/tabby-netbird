import { Injectable, NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { BaseTabComponent, ConfigProvider, ConfigService, NewTabParameters, PartialProfile, ProfileProvider, VaultService } from 'tabby-core'
// Type-only: `tabby-ssh` is deliberately NOT a peerDependency. A fresh Tabby
// plugins folder has no tabby-ssh installed, so declaring it as a peer (even
// wildcarded) makes npm auto-install a real copy to satisfy it - and that
// package's Windows postinstall script is currently broken, which breaks
// installing this plugin too. Keep this a type-only import (erased at build
// time) so it stays true.
import type { SSHProfile } from 'tabby-ssh'
import { SettingsTabProvider } from 'tabby-settings'

import { NetBirdConfigProvider } from './config.provider'
import { NetBirdPeer, ResolvedPeerSettings, applyRules, passwordSecretFromRef, patSecretRef, peerLabel, peerLabelGroups } from './models'
import { NetBirdSettingsTabComponent } from './settingsTab.component'
import { NetBirdSettingsTabProvider } from './settingsTab.provider'

async function fetchPeers (managementUrl: string, pat: string): Promise<NetBirdPeer[]> {
    const url = `${managementUrl.replace(/\/$/, '')}/api/peers`
    const res = await fetch(url, {
        headers: { Authorization: `Token ${pat}`, Accept: 'application/json' },
    })
    if (!res.ok) {
        throw new Error(`tabby-netbird: management API returned HTTP ${res.status} (check your PAT and management URL)`)
    }
    const body = await res.json() as NetBirdPeer[]
    return Array.isArray(body) ? body : []
}

async function loadPat (config: ConfigService, vault: VaultService): Promise<string | undefined> {
    const store = config.store.netbird
    if (store.patPlain) { return store.patPlain }
    if (store.patRef) {
        const spec = passwordSecretFromRef(store.patRef)
        if (spec) {
            return (await vault.getSecret(spec.type, spec.key))?.value
        }
    }
    return undefined
}

@Injectable({ providedIn: 'root' })
export class NetBirdProfilesService extends ProfileProvider<SSHProfile> {
    id = 'netbird'
    name = 'Tabby NetBird'

    configDefaults = {
        options: {
            host: '',
            port: 22,
            // No default user: Tabby prompts for username and password at
            // connect time instead of autofilling 'root'.
        },
    }

    constructor (private config: ConfigService, private vault: VaultService) {
        super()
    }

    async getBuiltinProfiles (): Promise<PartialProfile<SSHProfile>[]> {
        try {
            return await this.getProfilesInner()
        } catch (e) {
            console.warn('tabby-netbird: profile listing failed', e)
            return []
        }
    }

    private async getProfilesInner (): Promise<PartialProfile<SSHProfile>[]> {
        console.info('tabby-netbird: listing profiles (v0.1.1)')
        const store = this.config.store.netbird
        const mgmtUrl = store.managementUrl
        if (!mgmtUrl) {
            console.info('tabby-netbird: no management URL set - nothing to list')
            return []
        }
        const pat = await loadPat(this.config, this.vault)
        if (!pat) { return [] }

        let peers: NetBirdPeer[]
        try {
            peers = await fetchPeers(mgmtUrl, pat)
        } catch (e) {
            console.warn('tabby-netbird: could not fetch peers from management API', e)
            return []
        }

        const groups = store.groups
        const rules = store.rules
        const onlyGrouped = store.onlyGrouped
        const naming = {
            groupLabelExcludes: store.groupLabelExcludes,
            showOfflineSuffix: store.showOfflineSuffix,
        }

        return Promise.all(peers
            .filter(peer => !onlyGrouped || (peer.groups?.length ?? 0) > 0)
            .map(peer => ({ peer, settings: applyRules(peer, rules, groups) }))
            .filter(({ settings }) => !settings.excluded)
            .map(({ peer, settings }) => this.peerToProfile(peer, settings, naming)))
    }

    private async peerToProfile (
        peer: NetBirdPeer,
        settings: ResolvedPeerSettings,
        naming: { groupLabelExcludes: string[], showOfflineSuffix: boolean },
    ): Promise<PartialProfile<SSHProfile>> {
        // Prefer the FQDN (magic DNS inside the netbird network) - Tabby SSH
        // resolves it once the local netbird client is connected; fall back
        // to the peer IP when no DNS label exists.
        const host = peer.dns_label || peer.ip
        const label = peerLabel(peer)
        const password = await this.resolvePassword(settings.password)

        const labelParts = settings.showGroupsInName ? peerLabelGroups(peer, naming.groupLabelExcludes) : []
        if (!peer.connected && naming.showOfflineSuffix) { labelParts.push('offline') }
        const name = labelParts.length ? `${label} (${labelParts.join(', ')})` : label

        return {
            // peer.id is NetBird's stable per-peer identifier.
            id: `netbird:${peer.id}`,
            type: 'ssh',
            name,
            group: settings.group,
            icon: 'fas fa-network-wired',
            isBuiltin: true,
            isTemplate: false,
            weight: 0,
            options: {
                host,
                port: 22,
                // user intentionally omitted unless a rule/group explicitly sets it -
                // tabby-ssh then prompts for username at connect time.
                ...(settings.user ? { user: settings.user } : {}),
                // `auth` unset ('auto') + no password: tabby-ssh prompts for
                // username AND password at connect time, with its built-in
                // "remember password" option.
                password,
                privateKeys: settings.privateKey ? [settings.privateKey] : [],
            },
        }
    }

    private async resolvePassword (passwordRef?: string): Promise<string|undefined> {
        const secretSpec = passwordSecretFromRef(passwordRef)
        if (!secretSpec) {
            if (passwordRef) {
                console.warn('tabby-netbird: ignoring invalid password reference')
            }
            return undefined
        }
        return (await this.vault.getSecret(secretSpec.type, secretSpec.key))?.value
    }

    async getNewTabParameters (): Promise<NewTabParameters<BaseTabComponent>> {
        // Never actually called: Tabby dispatches by `provider.id === profile.type`,
        // and our profiles use type 'ssh', so the built-in SSH provider handles them.
        throw new Error('not implemented - handled by the built-in ssh provider')
    }

    getDescription (profile: PartialProfile<SSHProfile>): string {
        return profile.options?.host ?? ''
    }
}

@NgModule({
    imports: [CommonModule, FormsModule],
    declarations: [NetBirdSettingsTabComponent],
    providers: [
        { provide: ProfileProvider, useExisting: NetBirdProfilesService, multi: true },
        { provide: SettingsTabProvider, useClass: NetBirdSettingsTabProvider, multi: true },
        { provide: ConfigProvider, useClass: NetBirdConfigProvider, multi: true },
    ],
})
export default class NetBirdModule { }