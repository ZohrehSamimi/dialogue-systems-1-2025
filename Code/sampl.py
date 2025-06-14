import azure.cognitiveservices.speech as speechsdk

# Replace with your Azure credentials
speech_key = "DShyFSZAlA9EMig6eEktPMkkjA7DPWlbCHFnLA9onrLVamJQ8ufuJQQJ99BBACi5YpzXJ3w3AAAYACOG3fBB"
region = "northeurope"

# Set up the speech config
speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=region)

# Set the output format to MP3
speech_config.set_speech_synthesis_output_format(speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3)

# Create audio config to save to file instead of playing
output_file = "output_speech.mp3"
audio_config = speechsdk.audio.AudioOutputConfig(filename=output_file)

# Create speech synthesizer
synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_config)

# Load SSML content from file
with open("C:/2025/University/Dialogue Systems/Lab3/dialogue-systems-1-2025/Code/sample.ssml", "r") as file:
    ssml_text = file.read()

# Speak the SSML
result = synthesizer.speak_ssml_async(ssml_text).get()

# Check result
if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
    print(f"✅ Speech synthesized successfully and saved to {output_file}")
else:
    print(f"⚠️ Speech synthesis failed: {result.reason}")
