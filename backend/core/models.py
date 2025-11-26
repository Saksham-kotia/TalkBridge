from django.db import models
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    PREFERRED_LANGUAGES = [
        ('en-US', 'English'),
        ('es-ES', 'Spanish'),
        ('fr-FR', 'French'),
        ('hi-IN', 'Hindi'),
    ]
    preferred_language = models.CharField(max_length=10, choices=PREFERRED_LANGUAGES, default='en-US')

class Room(models.Model):
    room_code = models.CharField(max_length=10, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    host = models.ForeignKey(User, on_delete=models.CASCADE, related_name='hosted_rooms')

    def __str__(self):
        return self.room_code

class Transcript(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE)
    sender = models.ForeignKey(User, on_delete=models.CASCADE)
    original_text = models.TextField()
    translated_text = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)