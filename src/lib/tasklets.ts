interface Tasklets {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    run<T>(task: (...args: any[]) => T, ...args: any[]): Promise<T>;
    runAll<T>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tasks: Array<(() => T) | { task: (...args: any[]) => T; args: any[] }>
    ): Promise<T[]>;
    configure(config: {
        maxWorkers?: number | "auto";
        minWorkers?: number;
        idleTimeout?: number;
        timeout?: number;
        logging?: "debug" | "info" | "warn" | "error" | "none";
        maxMemory?: number;
        adaptive?: boolean;
        workload?: "cpu" | "io";
    }): void;
}

let instance: Tasklets | null = null;

export async function getTasklets(): Promise<Tasklets | null> {
    if (typeof window !== "undefined") return null; // Node.js only

    if (!instance) {
        const { default: TaskletsClass } = await import("@wendelmax/tasklets");
        instance = new TaskletsClass() as Tasklets;
        instance.configure({
            maxWorkers: "auto",
            adaptive: true,
            logging: "warn",
        });
    }
    return instance;
}
