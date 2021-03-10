import * as fs from "fs";
import { createWriteStream, mkdirSync, WriteStream } from "fs";
import * as path from "path";
import { WebSocketEvents } from "../TwilioCall";
import { TwilioConnectionEvents } from "../twilio";
import { FilenameFactory } from "./filename/FilenameFactory";
import { ivrNumberAndTestNameFilename } from "./filename/ivrNumberAndTestNameFilename";
import { Config } from "../../configuration/Config";
import { ConfigurationError } from "../../configuration/ConfigurationError";
import { TwilioCaller, TwilioMediaStreamStartEvent } from "../TwilioCaller";
import { IvrTesterPlugin } from "../../plugins/IvrTesterPlugin";
import { Emitter } from "../../Emitter";
import { PluginEvents } from "../../plugins/PluginManager";
import { TestSession } from "../../testRunner";
import { PromptMatchedEvent } from "../../testing/test/CallFlowTestDefinition";

export interface RecorderConfig {
  outputPath: string;
  filename?: string | FilenameFactory;
  includeResponse: boolean;
}

export const transcriptRecorderPlugin = (config: Config): IvrTesterPlugin => {
  if (!config.recording?.transcript) {
    return {
      initialise(): void {
        /* Intentionally empty */
      },
    };
  }

  const recorderConfig: RecorderConfig = {
    outputPath: config.recording?.transcript?.outputPath,
    filename:
      config.recording?.transcript?.filename || ivrNumberAndTestNameFilename,
    includeResponse: config.recording?.transcript?.includeResponse ?? false,
  };

  if (!recorderConfig.outputPath) {
    throw new ConfigurationError(
      "recording.transcript.outputPath",
      "Path must be defined"
    );
  }

  if (!fs.existsSync(recorderConfig.outputPath)) {
    throw new ConfigurationError(
      "recording.transcript.outputPath",
      "Path does not exist"
    );
  }

  return {
    initialise(eventEmitter: Emitter<PluginEvents>): void {
      eventEmitter.on("callServerStarted", ({ callServer }) => {
        callServer.on("testStarted", ({ testSession }) => {
          new TranscriptRecorder(testSession, recorderConfig);
        });
      });
    },
  };
};

export class TranscriptRecorder {
  private static readonly FILE_EXT = "txt";
  private static readonly FILENAME_SUFFIX = "transcript";

  private readonly processTwilioMessageRef: (message: string) => void;
  private readonly saveMatchedPromptRef: (event: PromptMatchedEvent) => void;
  private readonly closeRef: () => void;

  private writeStream: WriteStream;

  constructor(
    private readonly testSession: TestSession,
    private readonly config: RecorderConfig
  ) {
    this.saveMatchedPromptRef = this.saveMatchedPrompts.bind(this);
    this.testSession.callFlowSession.on(
      "promptMatched",
      this.saveMatchedPromptRef
    );

    this.closeRef = this.close.bind(this);
    this.testSession.callFlowSession.on("allPromptsMatched", this.closeRef);

    this.testSession.callFlowSession.on(
      "timeoutWaitingForMatch",
      this.closeRef
    );

    this.processTwilioMessageRef = this.processTwilioMessage.bind(this);

    const connection = this.testSession.call.getStream();
    connection.on(WebSocketEvents.Message, this.processTwilioMessageRef);
  }

  private processTwilioMessage(message: string) {
    const data = JSON.parse(message);

    if (data.event === TwilioConnectionEvents.MediaStreamStart) {
      this.createFile(data as TwilioMediaStreamStartEvent);
    }
  }

  private saveMatchedPrompts(event: PromptMatchedEvent) {
    const prompt = [];
    if (this.config.includeResponse) {
      prompt.push(`Them: ${event.transcription}`);
      prompt.push(`You: ${event.promptDefinition.then.describe()}`);
    } else {
      prompt.push(`${event.transcription}`);
    }

    this.writeStream.write(`${prompt.join("\n")}\n\n`);
  }

  private createFilename(event: TwilioMediaStreamStartEvent): string {
    const call = TwilioCaller.extractParameters(event);
    let filename: string;

    if (typeof this.config.filename === "string") {
      filename = this.config.filename;
    } else if (typeof this.config.filename === "function") {
      filename = this.config.filename(
        {
          sid: event.streamSid,
          call,
        },
        this.testSession.callFlowTestDefinition,
        TranscriptRecorder.FILENAME_SUFFIX
      );
    }

    return `${filename}.${TranscriptRecorder.FILE_EXT}`;
  }

  private createFile(event: TwilioMediaStreamStartEvent): void {
    const filename = this.createFilename(event);
    const filepath = path.join(this.config.outputPath, filename);

    console.log(`Recording transcript to '${filepath}'`);
    mkdirSync(this.config.outputPath, { recursive: true });

    this.writeStream = createWriteStream(filepath);
  }

  private close() {
    const callFlowSession = this.testSession.callFlowSession;
    callFlowSession.off("promptMatched", this.saveMatchedPromptRef);

    this.testSession.callFlowSession.off("allPromptsMatched", this.closeRef);

    this.testSession.callFlowSession.off(
      "timeoutWaitingForMatch",
      this.closeRef
    );

    const connection = this.testSession.call.getStream();
    connection.off(WebSocketEvents.Close, this.closeRef);

    this.writeStream.close();
    this.writeStream = null;
  }
}
