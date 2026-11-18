from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.inventory.models import StockBalance, StockLocation
from .models import Brand, Category, Product, ProductBarcode, Unit


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

    def create_product(
        self,
        *,
        name,
        sku,
        is_active=True,
        brand=None,
        model_number='',
    ):
        return Product.objects.create(
            name=name,
            sku=sku,
            category=self.category,
            brand=brand,
            model_number=model_number,
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

    def test_product_filters_can_find_stocked_and_unstocked_items(self):
        location = StockLocation.objects.create(
            name='Test store',
            code='TEST-STORE',
        )
        brand = Brand.objects.create(name='Test brand')
        matching_product = self.create_product(
            name='Matching product',
            sku='MATCH-SKU',
            brand=brand,
            model_number='MODEL-200',
        )
        self.create_product(
            name='Other product',
            sku='OTHER-SKU',
            model_number='MODEL-100',
        )
        StockBalance.objects.create(
            product=matching_product,
            location=location,
            quantity_on_hand='2.000',
            quantity_reserved='0.000',
        )

        filters = {
            'location': location.id,
            'category': self.category.id,
            'unit': self.unit.id,
            'brand': brand.id,
            'sku': 'match',
            'model_number': '200',
        }
        in_stock_response = self.client.get(
            reverse('products-list'),
            filters,
        )
        all_products_response = self.client.get(
            reverse('products-list'),
            {**filters, 'in_stock': 'false'},
        )

        self.assertEqual(in_stock_response.status_code, 200)
        self.assertEqual(
            [item['id'] for item in in_stock_response.data],
            [matching_product.id],
        )
        self.assertEqual(all_products_response.status_code, 200)
        self.assertEqual(
            [item['id'] for item in all_products_response.data],
            [matching_product.id],
        )
        self.assertEqual(
            all_products_response.data[0]['location_quantity_available'],
            '2.000',
        )

    def test_all_products_filter_includes_items_without_location_stock(self):
        location = StockLocation.objects.create(
            name='Test store',
            code='TEST-STORE',
        )
        product = self.create_product(
            name='Unstocked product',
            sku='UNSTOCKED-SKU',
        )

        response = self.client.get(
            reverse('products-list'),
            {'location': location.id, 'in_stock': 'false'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['id'] for item in response.data], [product.id])
        self.assertEqual(
            response.data[0]['location_quantity_available'],
            '0.000',
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


class StoreManagerCatalogAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        manager = get_user_model().objects.create_user(
            username='store-manager',
            email='manager@example.com',
            password='test-password',
            role='STORE_MANAGER',
        )
        self.client.force_authenticate(user=manager)

    def test_store_manager_can_add_and_edit_categories_brands_and_units(self):
        category_response = self.client.post(
            reverse('categories-list'),
            {'name': 'Accessories'},
        )
        brand_response = self.client.post(
            reverse('brands-list'),
            {'name': 'Test brand'},
        )
        unit_response = self.client.post(
            reverse('units-list'),
            {'name': 'Piece', 'abbreviation': 'pc'},
        )

        self.assertEqual(category_response.status_code, 201)
        self.assertEqual(brand_response.status_code, 201)
        self.assertEqual(unit_response.status_code, 201)

        updated_category = self.client.patch(
            reverse(
                'categories-detail',
                args=[category_response.data['id']],
            ),
            {'name': 'Accessories and cables', 'is_active': False},
        )
        updated_brand = self.client.patch(
            reverse('brands-detail', args=[brand_response.data['id']]),
            {'description': 'Updated description'},
        )
        updated_unit = self.client.patch(
            reverse('units-detail', args=[unit_response.data['id']]),
            {'abbreviation': 'pcs'},
        )

        self.assertEqual(updated_category.status_code, 200)
        self.assertFalse(updated_category.data['is_active'])
        self.assertEqual(updated_brand.status_code, 200)
        self.assertEqual(
            updated_brand.data['description'],
            'Updated description',
        )
        self.assertEqual(updated_unit.status_code, 200)
        self.assertEqual(updated_unit.data['abbreviation'], 'pcs')
