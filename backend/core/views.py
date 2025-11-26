from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from .models import Room, User
import uuid

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    username = request.data.get('username')
    password = request.data.get('password')
    lang = request.data.get('preferred_language', 'en-US')
    
    if User.objects.filter(username=username).exists():
        return Response({'error': 'Username exists'}, status=400)
    
    user = User.objects.create_user(username=username, password=password, preferred_language=lang)
    refresh = RefreshToken.for_user(user)
    
    return Response({
        'refresh': str(refresh),
        'access': str(refresh.access_token),
        'user_id': user.id,
        'language': user.preferred_language
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_room(request):
    room_code = str(uuid.uuid4())[:8].upper()
    room = Room.objects.create(room_code=room_code, host=request.user)
    return Response({'room_code': room_code})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_room(request):
    room_code = request.data.get('room_code')
    if not Room.objects.filter(room_code=room_code).exists():
        return Response({'error': 'Room not found'}, status=404)
    return Response({'room_code': room_code})

from django.urls import path
urlpatterns = [
    path('auth/register/', register),
    path('rooms/create/', create_room),
    path('rooms/join/', join_room),
]