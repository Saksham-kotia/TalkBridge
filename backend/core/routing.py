from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/signal/(?P<room_code>\w+)/$', consumers.SignalingConsumer.as_asgi()),
    re_path(r'ws/translate/$', consumers.TranslationConsumer.as_asgi()),
]