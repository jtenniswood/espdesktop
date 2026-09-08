export type AppTestHookRegistrar = (groupName: string, hooks: Record<string, any>) => void;

export function createAppTestHookRegistrar(): AppTestHookRegistrar {
    return function registerEspDesktopTestHookGroup(groupName: string, hooks: Record<string, any>) {
        if (typeof globalThis === "undefined" || !globalThis.__ESPDESKTOP_TEST_HOOKS__)
            return;
        var registry: any = globalThis.__ESPDESKTOP_TEST_HOOKS__;
        if (!registry.config)
            registry.config = {};
        if (!registry.groups)
            registry.groups = {};
        if (registry.groups[groupName]) {
            throw new Error("Duplicate ESPDesktop test hook group: " + groupName);
        }
        registry.groups[groupName] = hooks || {};
        for (var key in registry.groups[groupName]) {
            if (Object.prototype.hasOwnProperty.call(registry.config, key)) {
                throw new Error("Duplicate ESPDesktop test hook: " + key);
            }
            registry.config[key] = registry.groups[groupName][key];
        }
    };
}
