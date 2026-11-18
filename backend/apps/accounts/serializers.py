
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

from rest_framework import serializers


User = get_user_model()


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    email = serializers.EmailField(required=False, write_only=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields[self.username_field].required = False

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        token['username'] = user.username
        token['email'] = user.email
        token['role'] = user.role

        return token

    def validate(self, attrs):
        email = attrs.pop('email', None)
        if email is not None:
            attrs[self.username_field] = (
                User.objects.filter(email__iexact=email)
                .values_list('username', flat=True)
                .first()
                or ''
            )
        elif not attrs.get(self.username_field):
            raise serializers.ValidationError({
                self.username_field: 'This field is required.'
            })

        data = super().validate(attrs)
        user = self.user

        data['user'] = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'phone_number': user.phone_number,
            'role': user.role,
            'is_staff': user.is_staff,
            'is_superuser': user.is_superuser,
        }

        return data


class UserManagementSerializer(serializers.ModelSerializer):

    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password]
    )

    class Meta:
        model = User

        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'phone_number',
            'role',
            'password',
            'is_active',
            'is_staff',
            'is_superuser',
            'created_at',
        ]

        read_only_fields = [
            'id',
            'is_staff',
            'is_superuser',
            'created_at',
        ]

    def validate_role(self, value):
        request = self.context.get('request')
        if (
            request
            and request.user.role == User.Role.STORE_MANAGER
            and value != User.Role.CASHIER
        ):
            raise serializers.ValidationError(
                'Store managers can only register cashier accounts.'
            )
        return value

    def create(self, validated_data):
        password = validated_data.pop('password')

        role = validated_data.get('role')

        user = User(**validated_data)

        user.set_password(password)

        # Only administrators receive Django staff access.
        user.is_staff = role == User.Role.ADMINISTRATOR

        user.save()

        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            validate_password(password, instance)
            instance.set_password(password)

        instance.is_staff = (
            instance.role == User.Role.ADMINISTRATOR
        )

        instance.save()

        return instance


class MyProfileSerializer(serializers.ModelSerializer):

    class Meta:
        model = User

        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'phone_number',
            'role',
        ]

        read_only_fields = ['id', 'username', 'role']
