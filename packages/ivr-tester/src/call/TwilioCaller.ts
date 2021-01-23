import { URL } from "url";
import { Twilio, twiml } from "twilio";
import { Call, TwilioConnectionEvents } from "./twilio";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import { Debugger } from "../Debugger";
import { Caller, RequestedCall } from "./Caller";
import { TestSubject } from "../testRunner";

export interface TwilioMediaStreamStartEvent {
  event: TwilioConnectionEvents.MediaStreamStart;
  streamSid: string;
  start: {
    customParameters: { from: string; to: string };
  };
}

export class TwilioCaller implements Caller<TestSubject> {
  private static debug = Debugger.getTwilioDebugger();

  constructor(private readonly twilioClient: Twilio) {}

  private static addParameters(stream: VoiceResponse.Stream, call: Call): void {
    stream.parameter({ name: "from", value: call.from });
    stream.parameter({ name: "to", value: call.to });
  }

  public static extractParameters(event: TwilioMediaStreamStartEvent): Call {
    const from = event?.start?.customParameters?.from;
    const to = event?.start?.customParameters?.to;

    if (!from || !to) {
      throw new Error(
        "Start Media event does not contain from/to custom parameters"
      );
    }

    return { from, to };
  }

  public async call(
    call: TestSubject,
    streamUrl: URL | string
  ): Promise<RequestedCall> {
    const response = new twiml.VoiceResponse();
    const connect = response.connect();
    const stream = connect.stream({
      url: streamUrl.toString(),
    });

    TwilioCaller.addParameters(stream, call);
    const callOptions = {
      twiml: response.toString(),
      ...call,
    };

    TwilioCaller.debug("Making call %O", callOptions);

    await this.twilioClient.calls.create(callOptions);
    return { type: "telephony", call };
  }
}
