import azure.cognitiveservices.speech as speechsdk
import json

# Replace with your Azure keys
speech_key = "DShyFSZAlA9EMig6eEktPMkkjA7DPWlbCHFnLA9onrLVamJQ8ufuJQQJ99BBACi5YpzXJ3w3AAAYACOG3fBB"
region = "northeurope"

# Set up config for detailed results
speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=region)
speech_config.output_format = speechsdk.OutputFormat.Detailed  # This is key!
recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config)

print("🎙️ Speak into your microphone...")

# Run recognition
result = recognizer.recognize_once()

# Access raw JSON output
if result.reason == speechsdk.ResultReason.RecognizedSpeech:
    print(f"🔊 Recognized: {result.text}")
    
    # Parse JSON for confidence
    raw_json = result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
    response = json.loads(raw_json)

    if "NBest" in response:
        print("\n📋 Alternatives with Confidence:")
        for alt in response["NBest"]:
            print(f"🗣 {alt['Display']}")
            print(f"📈 Confidence: {alt['Confidence']}\n")
    else:
        print("⚠️ No 'NBest' confidence data found.")
elif result.reason == speechsdk.ResultReason.NoMatch:
    print("❌ No recognizable speech.")
else:
    print(f"⚠️ Recognition failed: {result.reason}")
