from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_user_email_verified_alter_user_role'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='email_verification_otp',
            field=models.CharField(blank=True, default='', max_length=6),
        ),
        migrations.AddField(
            model_name='user',
            name='email_verification_otp_expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
