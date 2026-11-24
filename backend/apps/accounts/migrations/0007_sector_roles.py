from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0006_phone_verification_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("ADMINISTRATOR", "Administrator"),
                    ("ACCOUNTANT", "Accountant"),
                    ("AUDITOR", "Auditor"),
                    ("CASHIER", "Cashier"),
                    ("ELECTRONICS_CASHIER", "Electronics Cashier"),
                    ("GAS_LPG_CASHIER", "Gas & LPG Cashier"),
                    ("SUPERVISOR", "Supervisor"),
                    ("STORE_MANAGER", "Store Manager"),
                ],
                default="CASHIER",
                max_length=30,
            ),
        ),
    ]
