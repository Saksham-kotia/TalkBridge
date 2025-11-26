from django.urls import path
from . import views

urlpatterns = [
    path('auth/register/', views.register, name='register'),
    path('rooms/create/', views.create_room, name='create_room'),
    path('rooms/join/', views.join_room, name='join_room'),
]