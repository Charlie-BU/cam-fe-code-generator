import { Command } from "commander";
import { loginRequired } from "../utils/utils";
import { pullAllApisInAllServices } from "../services/code-generate";

export const registerUpdateCommand = (program: Command) => {
    program
        .command("update [service]")
        .description("Generate all configured services, or update one service to latest by name or UUID")
        .action(loginRequired(async (service?: string) => {
            await pullAllApisInAllServices(service);
        }));
};
