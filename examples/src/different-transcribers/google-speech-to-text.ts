import {
  Config,
  contains,
  doNothing,
  isAnything,
  IvrTester,
  press,
  similarTo,
  Scenario,
  TestSubject,
} from "ivr-tester";
import path from "path";
import { googleSpeechToText } from "ivr-tester-transcriber-google-speech-to-text";
import ngrok from "ngrok";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

const call: TestSubject = {
  from: process.env.FROM_PHONE_NUMBER,
  to: process.env.TO_PHONE_NUMBER,
};

const timeout = 6000;

const scenarios: Scenario[] = [
  {
    name: "Keys pressed are read back",
    steps: [
      {
        whenPrompt: isAnything(),
        then: press("1"),
        silenceAfterPrompt: 2000,
        timeout,
      },
      {
        whenPrompt: contains("please enter a number"),
        then: press("0123456789"),
        silenceAfterPrompt: 3000,
        timeout,
      },
      {
        whenPrompt: contains("you entered the values 0123456789"),
        then: doNothing(),
        silenceAfterPrompt: 3000,
        timeout,
      },
    ],
  },
  {
    name: "API call with short latency",
    steps: [
      {
        whenPrompt: isAnything(),
        then: press("3"),
        silenceAfterPrompt: 2000,
        timeout,
      },
      {
        whenPrompt: similarTo(
          "please wait while we search for your phone number on our system"
        ),
        then: doNothing(),
        silenceAfterPrompt: 1500,
        timeout,
      },
      {
        whenPrompt: contains("please enter a number"),
        then: press("123"),
        silenceAfterPrompt: 3000,
        timeout,
      },
      {
        whenPrompt: similarTo("you entered the values 123"),
        then: doNothing(),
        silenceAfterPrompt: 3000,
        timeout,
      },
    ],
  },
  {
    name: "API call with long latency",
    steps: [
      {
        whenPrompt: isAnything(),
        then: press("4"),
        silenceAfterPrompt: 2000,
        timeout,
      },
      {
        whenPrompt: similarTo(
          "please wait while we search for your phone number on our system"
        ),
        then: doNothing(),
        silenceAfterPrompt: 3000,
        timeout,
      },
      {
        whenPrompt: contains("please enter a number"),
        then: press("123"),
        silenceAfterPrompt: 3000,
        timeout,
      },
      {
        whenPrompt: similarTo("you entered the values 123"),
        then: doNothing(),
        silenceAfterPrompt: 3000,
        timeout,
      },
    ],
  },
];

const config: Config = {
  localServerPort: 8080,
  transcriber: googleSpeechToText({
    languageCode: "en-GB",
    speechPhrases: [
      "Press 1 for playback flow",
      "Press 2 for long pauses flow",
      "Press 3 for short latency flow",
      "Press 4 for long latency flow",
      "Please enter a number",
      "You entered the values 0123456789. Thank you.",
    ],
    useEnhanced: true,
  }),
  recording: {
    audio: {
      outputPath: path.join(__dirname, "../recordings"),
    },
    transcript: {
      outputPath: path.join(__dirname, "../recordings"),
      includeResponse: true,
    },
  },
};

ngrok.connect(config.localServerPort).then((url) =>
  new IvrTester({ ...config, publicServerUrl: url })
    .run(call, scenarios)
    .then(() => process.exit())
    .catch(() => process.exit(1))
);