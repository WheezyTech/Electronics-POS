
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import CustomTokenObtainPairSerializer
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from django.contrib.auth import get_user_model

from .serializers import (
    CustomTokenObtainPairSerializer,
    UserManagementSerializer,
    MyProfileSerializer,
)

from .permissions import IsAdministrator


User = get_user_model()

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class UserManagementViewSet(viewsets.ModelViewSet):

    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserManagementSerializer
    permission_classes = [IsAdministrator]

    http_method_names = [
        'get',
        'post',
        'put',
        'patch',
        'head',
        'options',
    ]

    @action(
        detail=False,
        methods=['get'],
        permission_classes=[IsAuthenticated],
        url_path='me'
    )
    def me(self, request):
        serializer = MyProfileSerializer(request.user)

        return Response(serializer.data)

    @action(
        detail=True,
        methods=['post'],
        url_path='deactivate'
    )
    def deactivate(self, request, pk=None):
        user = self.get_object()

        if user.pk == request.user.pk:
            return Response(
                {'detail': 'You cannot deactivate your own account.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.is_active = False
        user.save(update_fields=['is_active'])

        return Response({
            'message': 'User account deactivated successfully.'
        })

    @action(
        detail=True,
        methods=['post'],
        url_path='activate'
    )
    def activate(self, request, pk=None):
        user = self.get_object()

        user.is_active = True
        user.save(update_fields=['is_active'])

        return Response({
            'message': 'User account activated successfully.'
        })
