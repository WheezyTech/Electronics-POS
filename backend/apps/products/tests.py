from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.inventory.models import StockBalance, StockLocation, StockMovement
from .models import Brand, Category, Product, ProductBarcode, ProductType, Unit


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
        product_type=None,
        model_number='',
    ):
        return Product.objects.create(
            name=name,
            sku=sku,
            category=self.category,
            product_type=product_type,
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

    def test_product_type_filter_returns_type_name(self):
        charger = ProductType.objects.create(name='Charger')
        earphone = ProductType.objects.create(name='Earphone')
        charger_product = self.create_product(
            name='USB charger',
            sku='CHARGER-SKU',
            product_type=charger,
        )
        self.create_product(
            name='Wireless earphone',
            sku='EARPHONE-SKU',
            product_type=earphone,
        )

        response = self.client.get(
            reverse('products-list'),
            {'product_type': charger.id},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['id'] for item in response.data], [charger_product.id])
        self.assertEqual(response.data[0]['product_type_name'], 'Charger')

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


class ProductOpeningStockTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        manager = get_user_model().objects.create_user(
            username='product-manager',
            email='product-manager@example.com',
            password='test-password',
            role='STORE_MANAGER',
        )
        self.client.force_authenticate(user=manager)
        self.location = StockLocation.objects.create(
            name='Main shop',
            code='MAIN',
            is_default=True,
        )
        self.category = Category.objects.create(name='Electronics')
        self.unit = Unit.objects.create(name='Piece', abbreviation='pc')
        self.payload = {
            'name': 'New phone',
            'sku': 'NEW-PHONE',
            'category': self.category.id,
            'unit': self.unit.id,
            'cost_price': '100.00',
            'selling_price': '150.00',
        }

    def test_create_product_with_opening_stock_records_adjustment(self):
        response = self.client.post(
            reverse('products-list'),
            {
                **self.payload,
                'opening_stock': '12.500',
                'opening_stock_location': self.location.id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201, response.data)
        product = Product.objects.get(sku='NEW-PHONE')
        balance = StockBalance.objects.get(
            product=product,
            location=self.location,
        )
        movement = StockMovement.objects.get(balance=balance)
        self.assertEqual(balance.quantity_on_hand, 12.5)
        self.assertEqual(
            movement.movement_type,
            StockMovement.MovementType.ADJUSTMENT,
        )
        self.assertEqual(movement.reference, 'OPENING')

    def test_create_product_with_type(self):
        product_type = ProductType.objects.create(name='Charger')

        response = self.client.post(
            reverse('products-list'),
            {
                **self.payload,
                'product_type': product_type.id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['product_type'], product_type.id)
        self.assertEqual(response.data['product_type_name'], 'Charger')

    def test_opening_stock_requires_a_location_and_does_not_create_product(self):
        response = self.client.post(
            reverse('products-list'),
            {**self.payload, 'opening_stock': '3'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('opening_stock_location', response.data)
        self.assertFalse(Product.objects.filter(sku='NEW-PHONE').exists())

    def test_create_without_opening_stock_does_not_create_a_stock_balance(self):
        response = self.client.post(
            reverse('products-list'),
            {
                **self.payload,
                'opening_stock': '0',
                'opening_stock_location': None,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        product = Product.objects.get(sku='NEW-PHONE')
        self.assertFalse(StockBalance.objects.filter(product=product).exists())
        self.assertFalse(
            StockMovement.objects.filter(balance__product=product).exists()
        )

    def test_opening_stock_is_rolled_back_for_inactive_product(self):
        response = self.client.post(
            reverse('products-list'),
            {
                **self.payload,
                'is_active': False,
                'opening_stock': '3',
                'opening_stock_location': self.location.id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Product.objects.filter(sku='NEW-PHONE').exists())


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

    def test_store_manager_can_add_and_edit_product_catalog_items(self):
        category_response = self.client.post(
            reverse('categories-list'),
            {'name': 'Accessories'},
        )
        product_type_response = self.client.post(
            reverse('product-types-list'),
            {'name': 'Charger'},
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
        self.assertEqual(product_type_response.status_code, 201)
        self.assertEqual(brand_response.status_code, 201)
        self.assertEqual(unit_response.status_code, 201)

        updated_category = self.client.patch(
            reverse(
                'categories-detail',
                args=[category_response.data['id']],
            ),
            {'name': 'Accessories and cables', 'is_active': False},
        )
        updated_product_type = self.client.patch(
            reverse(
                'product-types-detail',
                args=[product_type_response.data['id']],
            ),
            {'name': 'Wall Charger', 'is_active': False},
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
        self.assertEqual(updated_product_type.status_code, 200)
        self.assertEqual(updated_product_type.data['name'], 'Wall Charger')
        self.assertFalse(updated_product_type.data['is_active'])
        self.assertEqual(updated_brand.status_code, 200)
        self.assertEqual(
            updated_brand.data['description'],
            'Updated description',
        )
        self.assertEqual(updated_unit.status_code, 200)
        self.assertEqual(updated_unit.data['abbreviation'], 'pcs')
