import azure.cognitiveservices.speech as speechsdk

# Replace with your Azure credentials
speech_key = "DShyFSZAlA9EMig6eEktPMkkjA7DPWlbCHFnLA9onrLVamJQ8ufuJQQJ99BBACi5YpzXJ3w3AAAYACOG3fBB"
region = "northeurope"

# Set up the speech config
speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=region)

# Create audio config (use default speaker)
audio_config = speechsdk.audio.AudioOutputConfig(use_default_speaker=True)

# Create speech synthesizer
synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_config)

# Load SSML content from file
with open("C:/2025/University/Dialogue Systems/Lab3/dialogue-systems-1-2025/Code/sample.ssml", "r") as file:

    ssml_text = file.read()

# Speak the SSML
result = synthesizer.speak_ssml_async(ssml_text).get()

# Check result
if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
    print("✅ Speech synthesized successfully.")
else:
    print(f"⚠️ Speech synthesis failed: {result.reason}")
