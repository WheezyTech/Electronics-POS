from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_user_email_verification_otp_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='phone_verified',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='user',
            name='phone_verification_otp_hash',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='user',
            name='phone_verification_otp_expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='phone_verification_last_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='phone_verification_attempts',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.CreateModel(
            name='AccountVerificationAudit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('PHONE_OTP_SENT', 'Phone OTP sent'), ('PHONE_OTP_VERIFIED', 'Phone OTP verified'), ('PHONE_OTP_FAILED', 'Phone OTP failed'), ('PHONE_MANUAL_APPROVED', 'Phone manually approved')], max_length=30)),
                ('details', models.CharField(blank=True, default='', max_length=255)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('performed_by', models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='performed_verification_audits', to='accounts.user')),
                ('user', models.ForeignKey(on_delete=models.CASCADE, related_name='verification_audits', to='accounts.user')),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
