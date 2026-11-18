from django.db import models


class BusinessSettings(models.Model):
    business_name = models.CharField(max_length=200, default="Electronics POS")
    business_address = models.TextField(blank=True)
    business_phone = models.CharField(max_length=30, blank=True)
    business_email = models.EmailField(blank=True)
    kra_pin = models.CharField(max_length=30, blank=True)

    currency = models.CharField(max_length=10, default="KES")
    timezone = models.CharField(max_length=50, default="Africa/Nairobi")

    tax_enabled = models.BooleanField(default=False)
    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=16.00
    )
    prices_include_tax = models.BooleanField(default=False)

    receipt_header = models.TextField(blank=True)
    receipt_footer = models.TextField(
        blank=True,
        default="Thank you for shopping with us!"
    )
    receipt_show_kra_pin = models.BooleanField(default=True)

    low_stock_alerts = models.BooleanField(default=True)
    allow_negative_stock = models.BooleanField(default=False)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Business Settings"
        verbose_name_plural = "Business Settings"

    def save(self, *args, **kwargs):
        # Maintain one shared settings record.
        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return self.business_name