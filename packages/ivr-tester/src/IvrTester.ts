import { TwilioCallServer } from "./TwilioCallServer";
import { Config } from "./configuration/Config";
import { TwilioCaller } from "./call/TwilioCaller";
import { AudioPlaybackCaller } from "./call/AudioPlaybackCaller";
import { Caller, RequestedCall } from "./call/Caller";
import { callConnectedTimeout } from "./callConnectedTimeout";
import { Call } from "./call/Call";
import { validateConfig } from "./configuration/validateConfig";
import { IvrNumber } from "./configuration/call/IvrNumber";
import { Subject, validateSubject } from "./configuration/call/validateSubject";
import { Emitter, TypedEmitter } from "./Emitter";
import { IvrTesterPlugin } from "./plugins/IvrTesterPlugin";
import { URL } from "url";

// export interface TestSession {
//   readonly scenario: Scenario;
//   readonly call: Call;
//   readonly callFlowTestSession: CallFlowTestSession;
// }

// function createPluginManager(
//   config: Config,
//   interaction: IvrCallFlowInteraction
// ): PluginManager {
//   return new PluginManager([
//     new StopTestRunnerWhenTestsComplete(),
//     consoleUserInterface(),
//     callConnectedTimeout(config),
//     mediaStreamRecorderPlugin(config),
//     transcriptRecorderPlugin(config),
//     ...interaction.getPlugins(),
//   ]);
// }

export interface RunnableTester {
  run(subject: Subject): Promise<void>;
}

export interface IvrCallFlowInteractionPromptEvent {
  /**
   * Call this prompt came from
   */
  call: Call;

  /**
   * Transcription of the prompt
   */
  transcription: string;

  /**
   * Description of how the interaction responded to the prompt
   */
  responseDescription: string;
}

export type IvrCallFlowInteractionEvents = {
  /**
   * Each interaction may have it's own strategy for determining when a prompt has finished
   * and certainly how it was respond to the prompt
   */
  prompt: IvrCallFlowInteractionPromptEvent;
};

export interface IvrCallFlowInteraction
  extends Emitter<IvrCallFlowInteractionEvents> {
  initialise(ivrTesterExecution: IvrTesterExecution): void;

  /**
   * Called when IVR Tester is about to close. This is where you need to prepare the integration
   * to be shutdown.
   */
  shutdown(): void;

  /**
   * Returns the times you want IVR Tester to phone the number
   */
  getNumberOfCallsToMake(): number;

  /**
   * Called when IVR Tester is starting to allow the interactions to provide plugins
   * that are called with lifecycle events.
   */
  getPlugins(): IvrTesterPlugin[];
}

export interface CallRequestedEvent {
  requestedCall: RequestedCall;
  total: number;
}

export interface CallRequestErroredEvent {
  error: Error;
}

export interface IvrTesterAborted {
  dueToFailure?: boolean;
  reason?: string;
}

/**
 * TODO Rewrite to remove my design decision below
 *
 * The events for IVR  including the setup and call server.
 *
 * I decided to have them all in one place to make it easier to discuss the
 * lifecycle of the tool. To make this possible I've coupled IVR Tester to the
 * Twilio Call Server.
 */
export type IvrTesterLifecycleEvents = {
  callServerListening: { localUrl: URL };

  callRequested: CallRequestedEvent;
  callRequestErrored: CallRequestErroredEvent;
  callConnected: { call: Call };
  callDisconnected: { call: Call };

  ivrTesterAborted: IvrTesterAborted;
  callServerStopped: Record<string, never>;
  callServerErrored: { error: Error };
};

/**
 * Interface exposed to plugins to allow them to listen to events and abort testing.
 */
export type ReadonlyIvrTesterLifecycle = Omit<
  Emitter<IvrTesterLifecycleEvents>,
  "emit"
>;

export type StopParams = {
  /**
   * If true this will cause IVR Tester to signify it failed to a failure e.g. exiting with error code 1
   */
  dueToFailure?: boolean;
  /**
   * Reason for stopping IVR Tester, this is emitted as part of the life-cycle event
   */
  reason?: string;
};

export interface IvrTesterExecution {
  lifecycleEvents: ReadonlyIvrTesterLifecycle;

  /**
   * Calling this will stop IVR Tester.
   */
  stop(params: StopParams): void;
}

/**
 * Despite the name this manages the interaction with an IVR call flow
 * e.g. making a call, sets up transcriber, cleanup, Twilio costs reporting etc
 *
 * It is up to the implementor of the {@link IvrCallFlowInteraction} to manage how it will
 * interact with the call
 */
export class IvrTester implements RunnableTester {
  private readonly config: Config;
  private running = false;

  private totalCallsOpen = 0;

  /**
   * Used to emit lifecycle events of IVR Tester
   */
  private readonly ivrTesterLifecycle: Emitter<IvrTesterLifecycleEvents>;
  private readonly plugins: IvrTesterPlugin[];

  private stopExecutionParams: StopParams | undefined;
  private stopExecutionCallback: (params: StopParams) => void;

  constructor(
    readonly configuration: Config,
    private readonly ivrCallFlowInteraction: IvrCallFlowInteraction
  ) {
    const result = validateConfig(configuration);
    if (result.error) {
      throw result.error;
    }
    if (!result.config) {
      throw new Error("Error loading configuration");
    }

    this.config = result.config;
    this.ivrTesterLifecycle = new TypedEmitter<IvrTesterLifecycleEvents>();

    this.plugins = [
      callConnectedTimeout(),
      // mediaStreamRecorderPlugin(),
      // transcriptRecorderPlugin(ivrCallFlowInteraction),
      // new StopTestRunnerWhenTestsComplete(),
      // consoleUserInterface(),

      // ...ivrCallFlowInteraction.getPlugins(),
    ];

    // TODO Do something with the plugins
    // this.pluginManager = createPluginManager(this.config);
  }

  private static iterateTimes(times: number): undefined[] {
    return Array(times).fill(undefined);
  }

  public async run(subject: Subject): Promise<void> {
    if (this.running) {
      throw new Error(
        "Instance of IvrTester can only run against a single subject at a time"
      );
    }
    this.running = true;

    const subjectValidationResult = validateSubject(subject);
    if (subjectValidationResult.error) {
      throw subjectValidationResult.error;
    }

    await this.preflightChecks();

    const callServer = new TwilioCallServer(
      this.config.dtmfGenerator,
      this.ivrTesterLifecycle,
      this.config.transcriber
    );

    const twilioClient = this.config.twilioClientFactory(
      this.config.twilioAuth
    );
    const caller: Caller<IvrNumber | Buffer> = Buffer.isBuffer(subject)
      ? new AudioPlaybackCaller()
      : new TwilioCaller(twilioClient);

    const execution: IvrTesterExecution = {
      lifecycleEvents: this.ivrTesterLifecycle,
      stop: (params) => {
        this.ivrTesterLifecycle.emit("ivrTesterAborted", params);
        if (this.stopExecutionCallback) {
          this.stopExecutionCallback(params);
        } else {
          this.stopExecutionParams = params;
        }
      },
    };

    this.plugins.forEach((p) => p.initialise(this.config, execution));

    this.ivrCallFlowInteraction.initialise(execution);

    const serverUrl = await callServer.listen(this.config.localServerPort);

    const totalCallsToMake = this.ivrCallFlowInteraction.getNumberOfCallsToMake();
    const calls = Promise.all(
      IvrTester.iterateTimes(totalCallsToMake).map(() => {
        console.log("About to make calls");
        return caller
          .call(subject, this.config.publicServerUrl || serverUrl)
          .then((callRequested) => {
            this.ivrTesterLifecycle.emit("callRequested", {
              requestedCall: callRequested,
              total: totalCallsToMake,
            });
            this.totalCallsOpen++;
          })
          .catch((error) => {
            this.ivrTesterLifecycle.emit("callRequestErrored", {
              error: new Error(error),
            });
            throw error;
          });
      })
    );

    return new Promise((resolve, reject) => {
      this.ivrTesterLifecycle.on("callServerStopped", reject);
      this.ivrTesterLifecycle.on("callServerErrored", reject);

      calls
        .then(() => {
          this.stopExecutionCallback = (params) => {
            this.ivrTesterLifecycle.off("callServerStopped", reject);
            this.ivrTesterLifecycle.off("callServerErrored", reject);

            this.ivrCallFlowInteraction.shutdown();

            callServer
              .stop()
              .catch((err) => err && console.error(err))
              .finally(() => {
                if (params.dueToFailure) {
                  reject(params.reason && new Error(params.reason));
                } else {
                  resolve();
                }
              });
          };

          // Interaction tried to stop the execution before the callback was set
          if (this.stopExecutionParams) {
            this.stopExecutionCallback(this.stopExecutionParams);
          }

          // TODO Will this event be emitted even if the call terminates due to an error?
          this.ivrTesterLifecycle.on("callDisconnected", () => {
            this.totalCallsOpen--;
            if (this.totalCallsOpen <= 0) {
              this.stopExecutionCallback({
                dueToFailure: false,
                reason: "All calls disconnected",
              });
            }
          });
        })
        .catch((error) => {
          this.ivrTesterLifecycle.off("callServerStopped", reject);
          this.ivrTesterLifecycle.off("callServerErrored", reject);

          callServer
            .stop()
            .catch((err) => err && console.error(err))
            .finally(() => reject(error));
        });
    });
  }

  private async preflightChecks(): Promise<void> {
    const checkResults = await this.config.transcriber.checkCanRun();
    if (checkResults.canRun === false) {
      throw new Error(
        `Error with the transcriber you've chosen:\n${checkResults.reason}`
      );
    }
  }
}