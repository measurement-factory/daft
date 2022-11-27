import Promise from "bluebird";
import * as Config from "../misc/Config";
import * as Gadgets from "../misc/Gadgets";
import RunTest from "../test/Runner";
import assert from "assert";
import path from "path";

function help(...error) {
    console.log("Usage:");
    console.log("    daft.js run <test.js> [test options]");
    console.log("    daft.js help");
    if (arguments.length > 0)
        console.log("Error:", ...error);
    return help; // a hack to prevent backtraces on wrong-usage errors
}

// extracts TestPlot argv from process.argv
function parseArgv() {
    if (process.argv.length <= 2)
        throw help("missing command (e.g., 'run')");

    const firstArg = process.argv[2];
    if (firstArg === "help" || firstArg === "--help" || firstArg === "-h") {
        help();
        return null;
    }

    if (firstArg.indexOf("-") === 0)
        throw help("unknown option:", firstArg);

    if (firstArg !== "run")
        throw help("unknown command:", firstArg);

    if (process.argv.length <= 3)
        throw help("missing a test script name");

    let result = process.argv.slice(3);
    result.unshift(process.argv[0]); // interpreter
    return result;
}

async function main_() {
    process.exitCode = 0;

    process.on("unhandledRejection", function (reason /*, promise */) {
        console.log("Quitting on a rejected promise...");
        throw reason;
    });

    Promise.config({ warnings: true });

    const commandArgv = parseArgv();
    if (!commandArgv)
        return; // --help and such

    assert(commandArgv.length >= 2); // interpreter test-script.js ...
    const testScriptLocationFromUserPov = commandArgv[1];
    const testScriptLocationAbsolute =
        testScriptLocationFromUserPov.indexOf("file:") === 0 ?
        testScriptLocationFromUserPov : // leave file:... URLs alone
        `file://${path.resolve(testScriptLocationFromUserPov)}`;

    // import before Config.Finalize() because commands usually add options
    const CommandModule = await import(testScriptLocationAbsolute);

    if (!Config.Finalize(commandArgv))
        return;

    const Test = CommandModule.default;
    await RunTest(Test);

    const errorsSwallowed = Gadgets.ErrorsSwallowed();
    if (errorsSwallowed) {
        assert(Config.KeepGoing || Config.Retries);
        throw new Error(`There were ${errorsSwallowed} errors`);
    }
}

// TODO: Remove "async", use top-level await, and rethrow (in the catch below)
// after moving to node v14.3.0.
async function main() {
    try {
        await main_();
    } catch (error) {
        if (error !== help) {
            // re-throwing here causes "Quitting on a rejected promise..."
            console.log(error);
            process.exit(1);
        }
    }
}

main();
