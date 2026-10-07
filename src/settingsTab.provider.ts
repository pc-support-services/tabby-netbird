import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { NetBirdSettingsTabComponent } from './settingsTab.component'

@Injectable()
export class NetBirdSettingsTabProvider extends SettingsTabProvider {
    id = 'netbird'
    icon = 'network-wired'
    title = 'NetBird'

    getComponentType (): any {
        return NetBirdSettingsTabComponent
    }
}