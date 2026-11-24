from django.db import migrations


def add_gas_and_lpg(apps, schema_editor):
    category = apps.get_model("products", "Category")
    product_type = apps.get_model("products", "ProductType")

    for name in ("Gas", "LPG"):
        category.objects.get_or_create(
            name=name,
            defaults={"description": f"{name} products", "is_active": True},
        )
        product_type.objects.get_or_create(
            name=name,
            defaults={"description": f"{name} products", "is_active": True},
        )


def remove_gas_and_lpg(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("products", "0002_producttype_product_product_type"),
    ]

    operations = [
        migrations.RunPython(add_gas_and_lpg, remove_gas_and_lpg),
    ]
