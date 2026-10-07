import { ConfigProvider } from 'tabby-core'

/**
 * Registers the `netbird` config key's defaults with Tabby's ConfigService.
 * Without this, `config.store.netbird` is never wired into the underlying
 * store the ConfigProxy persists - reads/writes on it would silently operate
 * on a disconnected property that never reaches config.yaml.
 */
export class NetBirdConfigProvider extends ConfigProvider {
    defaults = {
        netbird: {
            managementUrl: '',
            patRef: undefined,
            patPlain: undefined,
            groups: [],
            rules: [],
            onlyGrouped: false,
            groupLabelExcludes: [],
            showOfflineSuffix: true,
            defaultUser: '',
            userOverrides: {},
        },
    }

    platformDefaults = {}
}