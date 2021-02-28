import { IvrTesterPlugin } from "../../plugins/IvrTesterPlugin";
import chalk from "chalk";
import logSymbols from "log-symbols";
import { CallServer } from "../TwilioCallServer";
import { Emitter } from "../../Emitter";
import { PluginEvents } from "../../plugins/PluginManager";
import { TestInstance } from "../test/TestInstanceClass";

const ivrTranscription = (
  callServer: CallServer,
  testInstance: TestInstance
): void => {
  let includeTestName = false;

  let totalTests = 0;
  callServer.on("testStarted", () => {
    totalTests++;
    if (totalTests >= 2) {
      includeTestName = true;
    }
  });

  testInstance.on("progress", (event) => {
    const state = chalk.gray.bold(
      // event.transcription.isFinal ? "Finished: " :
      "Transcribing: "
    );

    const testName = includeTestName ? `${event.test.name}: ` : "";
    console.log(
      state + chalk.gray(`${testName}${event.transcription.transcription}`)
    );
  });
};

const ivrTestPassed = (emitter: TestInstance): void =>
  emitter.on("testPassed", (event) =>
    console.log(
      logSymbols.success,
      chalk.green(`Test Complete: ${event.test.name}...`)
    )
  );

const ivrTestFailed = (testInstance: TestInstance): void =>
  testInstance.on("testFailed", (event) => {
    console.log(
      `${chalk.bold.blue("Test -")} ${chalk.bold.blue(event.test.name)}\n`,
      `Them: "${event.transcription}"\n`,
      chalk.red("No condition matched this transcript\n")
    );
    console.log(logSymbols.error, chalk.bold.red(`Test Failed`));
  });

const callConnected = (callServer: CallServer): void => {
  callServer.on("callConnected", () => {
    console.log("Call connected");
  });
};

const callServerListening = (callServer: CallServer): void => {
  callServer.on("listening", ({ localUrl }) => {
    // const { port } = localUrl.port.address() as AddressInfo;
    console.log(
      `Server is listening on ${localUrl.port} for the stream for the call`
    );
  });
};

const callServerStopped = (callServer: CallServer): void => {
  callServer.on("stopped", () => console.log("The server has closed"));
};

const callServerErrored = (callServer: CallServer): void => {
  callServer.on("error", (event) =>
    console.error("Server experienced an error", event.error.message)
  );
};

const callRequested = (emitter: Emitter<PluginEvents>): void =>
  emitter.on("callRequested", (event) => {
    switch (event.requestedCall.type) {
      case "audio-playback":
        console.log("Playing back audio to simulate call");
        break;
      case "telephony":
        console.log(`Calling ${event.requestedCall.call.to}...`);
        break;
    }
  });

const callRequestErrored = (emitter: Emitter<PluginEvents>): void =>
  emitter.on("callRequestErrored", (event) =>
    console.error(`Call failed`, event.error.message)
  );

const ivrTestConditionMet = (
  callServer: CallServer,
  testInstance: TestInstance
): void => {
  let includeTestName = false;

  let totalTests = 0;
  callServer.on("testStarted", () => {
    totalTests++;
    if (totalTests >= 2) {
      includeTestName = true;
    }
  });

  testInstance.on("conditionMet", (event) => {
    const lines: string[] = [];

    if (includeTestName) {
      lines.push(`Test - ${event.test.name}`);
    }
    lines.push(`Them: "${event.transcription}"`);
    lines.push(`You: ${event.condition.then.describe()}`);

    console.log(chalk.bold.blue(lines.join(`\n`)));
  });
};

const callServerStarted = (eventEmitter: Emitter<PluginEvents>) => {
  eventEmitter.on("callServerStarted", ({ callServer }) => {
    callConnected(callServer);
    callServerListening(callServer);
    callServerStopped(callServer);
    callServerErrored(callServer);

    callServer.on("testStarted", ({ testInstance }) => {
      console.log(`Call using test '${testInstance.getTest().name}'`);
      ivrTestPassed(testInstance);
      ivrTestFailed(testInstance);
      ivrTestConditionMet(callServer, testInstance);
      ivrTranscription(callServer, testInstance);
    });
  });
};

export interface ConsoleLoggerPlugin extends IvrTesterPlugin {
  timedOut(reason: string): void;
}

export const consoleUserInterface = (): ConsoleLoggerPlugin => ({
  initialise(eventEmitter: Emitter<PluginEvents>): void {
    callServerStarted(eventEmitter);
    callRequested(eventEmitter);
    callRequestErrored(eventEmitter);
  },
  timedOut(reason: string): void {
    console.log(chalk.bold.red(`Timed out: ${reason}`));
  },
});
