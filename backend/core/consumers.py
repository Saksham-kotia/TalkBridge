import json
import base64
from channels.generic.websocket import AsyncWebsocketConsumer
from google.cloud import speech, translate_v2 as translate, texttospeech

# === SIGNALING CONSUMER (WebRTC Handshake) ===
class SignalingConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_code = self.scope['url_route']['kwargs']['room_code']
        self.room_group_name = f'chat_{self.room_code}'
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'signal_message', 'message': data, 'sender_channel': self.channel_name}
        )

    async def signal_message(self, event):
        if event['sender_channel'] != self.channel_name:
            await self.send(text_data=json.dumps(event['message']))


# === REAL TRANSLATION CONSUMER (High Accuracy) ===
class TranslationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        # Default target language
        self.target_lang = 'es' 
        
        try:
            self.speech_client = speech.SpeechClient()
            self.translate_client = translate.Client()
            self.tts_client = texttospeech.TextToSpeechClient()
            print("✅ Connected to Google Cloud")
        except Exception as e:
            print(f"❌ Error: {e}")
            await self.close()

    async def receive(self, text_data=None, bytes_data=None):
        # === CASE 1: CONFIGURATION (Set Language) ===
        if text_data:
            data = json.loads(text_data)
            if data.get('type') == 'config':
                self.target_lang = data.get('lang', 'es')
                print(f"🌐 Target Language Set to: {self.target_lang}")
                return

        # === CASE 2: AUDIO STREAM (Process Voice) ===
        if bytes_data:
            audio = speech.RecognitionAudio(content=bytes_data)
            
            # === ACCURACY FIX: Changed model to 'default' ===
            config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
                sample_rate_hertz=16000,
                language_code="en-US",
                enable_automatic_punctuation=True,
                model='default', # <--- CHANGED FROM 'video' TO 'default'
                audio_channel_count=1
            )
            
            try:
                response = self.speech_client.recognize(config=config, audio=audio)
                
                # Check if we heard anything
                if not response.results:
                    print("⚠️ Audio received but could not understand speech.")
                    return

                for result in response.results:
                    transcript = result.alternatives[0].transcript
                    confidence = result.alternatives[0].confidence
                    print(f"🎤 Heard (Confidence: {confidence:.2f}): {transcript}")

                    # Use the dynamic target language
                    translation = self.translate_client.translate(
                        transcript, target_language=self.target_lang
                    )
                    translated_text = translation['translatedText']
                    print(f"🔄 Translated ({self.target_lang}): {translated_text}")

                    # Generate TTS
                    synthesis_input = texttospeech.SynthesisInput(text=translated_text)
                    voice = texttospeech.VoiceSelectionParams(
                        language_code=self.target_lang,
                        ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
                    )
                    audio_config = texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3)
                    
                    tts_response = self.tts_client.synthesize_speech(
                        input=synthesis_input, voice=voice, audio_config=audio_config
                    )
                    audio_b64 = base64.b64encode(tts_response.audio_content).decode('utf-8')

                    await self.send(text_data=json.dumps({
                        'type': 'translation',
                        'original': transcript,
                        'translated': translated_text,
                        'audio': audio_b64
                    }))
            except Exception as e:
                print(f"Error processing audio: {e}")