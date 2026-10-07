// All Profile fields required to satisfy Tabby's ProfileProvider<T> constraint.
declare module 'tabby-ssh' {
    export interface SSHProfileOptions {
        [key: string]: any
    }
    export interface SSHProfile {
        id: string
        disableDynamicTitle: boolean
        weight: number
        isBuiltin: boolean
        isTemplate: boolean
        type: string
        name: string
        options: SSHProfileOptions
        [key: string]: any
    }
}