from django.db import migrations, models
from decimal import Decimal


class Migration(migrations.Migration):
    dependencies = [
        ("gas", "0003_alter_gasexchange_payment_method_and_more"),
    ]

    operations = [
        migrations.AddField(model_name="gasrefill", name="tax_rate", field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=5)),
        migrations.AddField(model_name="gasrefill", name="tax_amount", field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=14)),
        migrations.AddField(model_name="gasrefill", name="tax_included", field=models.BooleanField(default=False)),
        migrations.AddField(model_name="gasexchange", name="tax_rate", field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=5)),
        migrations.AddField(model_name="gasexchange", name="tax_amount", field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=14)),
        migrations.AddField(model_name="gasexchange", name="tax_included", field=models.BooleanField(default=False)),
        migrations.AddField(model_name="newcylindersale", name="tax_rate", field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=5)),
        migrations.AddField(model_name="newcylindersale", name="tax_amount", field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=14)),
        migrations.AddField(model_name="newcylindersale", name="tax_included", field=models.BooleanField(default=False)),
    ]
