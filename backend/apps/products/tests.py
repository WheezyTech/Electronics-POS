from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.inventory.models import StockBalance, StockLocation
from .models import Category, Product, ProductBarcode, Unit


class ProductLookupTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(
            user=get_user_model().objects.create_user(
                username='cashier',
                email='cashier@example.com',
                password='test-password',
            )
        )
        self.category = Category.objects.create(name='Test category')
        self.unit = Unit.objects.create(name='Each', abbreviation='ea')

    def create_product(self, *, name, sku, is_active=True):
        return Product.objects.create(
            name=name,
            sku=sku,
            category=self.category,
            unit=self.unit,
            cost_price='1.00',
            selling_price='2.00',
            is_active=is_active,
        )

    def test_active_barcode_match_wins_over_inactive_sku_match(self):
        self.create_product(
            name='Inactive SKU match',
            sku='SHARED-CODE',
            is_active=False,
        )
        active_product = self.create_product(
            name='Active barcode match',
            sku='ACTIVE-SKU',
        )
        ProductBarcode.objects.create(
            product=active_product,
            barcode='SHARED-CODE',
        )

        response = self.client.get(
            reverse('products-lookup'),
            {'code': 'SHARED-CODE'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], active_product.id)

    def test_inactive_product_match_returns_specific_error(self):
        product = self.create_product(
            name='Inactive product',
            sku='INACTIVE-SKU',
            is_active=False,
        )
        ProductBarcode.objects.create(
            product=product,
            barcode='INACTIVE-CODE',
        )

        response = self.client.get(
            reverse('products-lookup'),
            {'code': 'INACTIVE-CODE'},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data['detail'], 'This product is inactive.')

    def test_location_search_only_returns_products_with_available_stock(self):
        location = StockLocation.objects.create(
            name='Test store',
            code='TEST-STORE',
        )
        stocked_product = self.create_product(
            name='Stocked product',
            sku='STOCKED-SKU',
        )
        self.create_product(
            name='Unstocked product',
            sku='UNSTOCKED-SKU',
        )
        StockBalance.objects.create(
            product=stocked_product,
            location=location,
            quantity_on_hand='5.000',
            quantity_reserved='1.000',
        )

        response = self.client.get(
            reverse('products-list'),
            {'search': 'product', 'location': location.id},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]['location_quantity_available'],
            '4.000',
        )

    def test_barcode_lookup_requires_stock_at_selected_location(self):
        location = StockLocation.objects.create(
            name='Test store',
            code='TEST-STORE',
        )
        product = self.create_product(
            name='No-stock product',
            sku='NO-STOCK-SKU',
        )
        ProductBarcode.objects.create(
            product=product,
            barcode='NO-STOCK-CODE',
        )

        response = self.client.get(
            reverse('products-lookup'),
            {'code': 'NO-STOCK-CODE', 'location': location.id},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.data['detail'],
            'This product has no available stock at the selected location.',
        )
