<?php

namespace Database\Seeders;

use App\Models\ParkingSlot;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        DB::statement('SET FOREIGN_KEY_CHECKS=0');

        $tables = [
            'inventory_logs', 'gasoline_payments', 'fuel_sales', 'fuel_inventory',
            'fuel_remittances', 'parking_remittances', 'parking_payments',
            'parking_transactions', 'bookings', 'vehicles', 'promo',
            'parking_slots', 'fuel_products', 'suppliers', 'otp_codes',
            'user_notifications', 'users',
        ];

        foreach ($tables as $table) {
            DB::table($table)->truncate();
        }

        DB::statement('SET FOREIGN_KEY_CHECKS=1');

        // ─── 1. Admin ────────────────────────────────────────────────────────
        $admin = User::create([
            'email'          => 'ragmacwelfred1@gmail.com',
            'password'       => Hash::make('password123'),
            'first_name'     => 'Admin',
            'middle_name'    => null,
            'last_name'      => 'User',
            'phone_number'   => '09123456789',
            'address'        => '123 Admin St, Manila, Philippines',
            'role'           => 'admin',
            'customer_type'  => null,
            'employee_id'    => 'ADMIN001',
            'is_active'      => true,
            'email_verified' => true,
        ]);

        // ─── 2. Staff ────────────────────────────────────────────────────────
        $staff1 = User::create([
            'email'          => 'staff1@parking.com',
            'password'       => Hash::make('password123'),
            'first_name'     => 'John',
            'middle_name'    => 'Michael',
            'last_name'      => 'Doe',
            'phone_number'   => '09234567890',
            'address'        => '456 Staff St, Quezon City, Philippines',
            'role'           => 'staff',
            'customer_type'  => null,
            'employee_id'    => 'EMP001',
            'is_active'      => true,
            'email_verified' => true,
        ]);

        $staff2 = User::create([
            'email'          => 'staff2@parking.com',
            'password'       => Hash::make('password123'),
            'first_name'     => 'Jane',
            'middle_name'    => 'Marie',
            'last_name'      => 'Smith',
            'phone_number'   => '09345678901',
            'address'        => '789 Staff Ave, Makati City, Philippines',
            'role'           => 'staff',
            'customer_type'  => null,
            'employee_id'    => 'EMP002',
            'is_active'      => true,
            'email_verified' => true,
        ]);

        // ─── 3. Parking Slots (16 slots — ALL ₱200/night) ───────────────────
        $slots = [];
        $slotNumbers = [
            'A01', 'A02', 'A03', 'A04',
            'A05', 'A06', 'A07', 'A08',
            'B01', 'B02', 'B03', 'B04',
            'B05', 'B06', 'B07', 'B08',
        ];

        $totalSlots = count($slotNumbers);
        foreach ($slotNumbers as $i => $slotNumber) {
            $status = 'available';
            if ($i < 3) {
                $status = 'occupied';
            } elseif ($i >= $totalSlots - 2) {
                $status = 'maintenance';
            }

            $slots[] = ParkingSlot::create([
                'slot_number'  => $slotNumber,
                'status'       => $status,
                'nightly_rate' => 200,
            ]);
        }

        // ─── 4. HISTORICAL DATA (para may laman ang Reports) ─────────────────
        // Laging "2 buwan bago ang current month" at "last month".
        // Hal. kung Sept ngayon → July at August.
        mt_srand(20260929); // fixed seed = pareho ang data every seed

        $months = [
            Carbon::now()->startOfMonth()->subMonths(2),
            Carbon::now()->startOfMonth()->subMonths(1),
        ];

        $fuelStats    = $this->seedFuelHistory([$staff1, $staff2], $months);
        $parkingStats = $this->seedParkingHistory($admin, [$staff1, $staff2], $slots, $months);

        $this->command->info('✅ Database seeded successfully!');
        $this->command->info('');
        $this->command->info('📊 SEED SUMMARY:');
        $this->command->info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        $this->command->info('👤 Admin:        ragmacwelfred1@gmail.com / password123');
        $this->command->info('👤 Staff:        staff1@parking.com / password123');
        $this->command->info('👤 Staff:        staff2@parking.com / password123');
        $this->command->info('');
        $this->command->info('🅿️  Slots:        ' . count($slots) . ' parking slots (ALL ₱200/night)');
        $this->command->info('⛽ Fuel sales:   ' . $fuelStats['sales'] . ' transactions, ₱' . number_format($fuelStats['revenue'], 2));
        $this->command->info('🚗 Parking:      ' . $parkingStats['bookings'] . ' completed bookings, ₱' . number_format($parkingStats['revenue'], 2));
        $this->command->info('📅 Period:       ' . $months[0]->format('F Y') . ' & ' . $months[1]->format('F Y'));
        $this->command->info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    // ═════════════════════════════════════════════════════════════════════════
    // FUEL: products, suppliers, deliveries, sales, payments, inventory logs
    // ═════════════════════════════════════════════════════════════════════════

    private function seedFuelHistory(array $staff, array $months): array
    {
        $now = Carbon::now();

        // Suppliers
        $supplierIds = [];
        foreach (['Petron Corporation', 'Phoenix Petroleum'] as $name) {
            $supplierIds[] = DB::table('suppliers')->insertGetId([
                'supplier_name' => $name,
                'created_at'    => $now,
                'updated_at'    => $now,
            ]);
        }

        // Products
        $productDefs = [
            ['type' => 'Gasoline', 'cost' => 58.50, 'sell' => 63.00],
            ['type' => 'Premium',  'cost' => 64.20, 'sell' => 69.50],
            ['type' => 'Diesel',   'cost' => 54.80, 'sell' => 59.00],
        ];

        $products = [];
        foreach ($productDefs as $def) {
            $id = DB::table('fuel_products')->insertGetId([
                'type'                  => $def['type'],
                'current_selling_price' => $def['sell'],
                'created_at'            => $now,
                'updated_at'            => $now,
            ]);
            $products[$id] = $def;
        }

        $stock    = array_fill_keys(array_keys($products), 0.0); // running stock per product
        $batches  = [];                                          // [productId => ['id'=>, 'remaining'=>]]
        $customerNames = [null, null, null, 'Juan Dela Cruz', 'Maria Santos', 'Pedro Reyes', 'Ana Lopez', 'Jose Garcia'];

        $totalSales   = 0;
        $totalRevenue = 0.0;

        $receive = function (Carbon $when, int $productId) use (&$stock, &$batches, $products, $supplierIds) {
            $def       = $products[$productId];
            $liters    = 9000.00;
            $batchId   = DB::table('fuel_inventory')->insertGetId([
                'fuel_product_id'         => $productId,
                'supplier_id'             => $supplierIds[$productId % count($supplierIds)],
                'delivery_date'           => $when->toDateString(),
                'liters_delivered'        => $liters,
                'remaining_liters'        => $liters,
                'cost_price_per_liter'    => $def['cost'],
                'selling_price_per_liter' => $def['sell'],
                'reference_no'            => 'DR-' . $when->format('Ym') . '-' . $productId,
                'created_at'              => $when,
                'updated_at'              => $when,
            ]);

            DB::table('inventory_logs')->insert([
                'fuel_inventory_id' => $batchId,
                'reference_id'      => $productId,
                'movement'          => 'in',
                'liters'            => $liters,
                'liters_before'     => $stock[$productId],
                'liters_after'      => $stock[$productId] + $liters,
                'price_per_liter'   => $def['cost'],
                'created_at'        => $when,
                'updated_at'        => $when,
            ]);

            $stock[$productId] += $liters;
            $batches[$productId] = ['id' => $batchId, 'remaining' => $liters, 'delivered' => $liters];
        };

        foreach ($months as $start) {
            $daysInMonth = $start->daysInMonth;

            // Delivery on the 1st of the month
            foreach (array_keys($products) as $pid) {
                unset($batches[$pid]);
                $receive($start->copy()->setTime(8, 0), $pid);
            }

            for ($d = 0; $d < $daysInMonth; $d++) {
                $day = $start->copy()->addDays($d);

                foreach ($products as $pid => $def) {
                    $count = mt_rand(2, 6);
                    $mins  = [];
                    for ($i = 0; $i < $count; $i++) {
                        $mins[] = mt_rand(360, 1320); // 6:00 AM – 10:00 PM
                    }
                    sort($mins);

                    foreach ($mins as $m) {
                        $liters = mt_rand(500, 4000) / 100; // 5.00 – 40.00 L
                        if ($batches[$pid]['remaining'] < $liters) {
                            continue;
                        }

                        $saleAt    = $day->copy()->setTime(intdiv($m, 60), $m % 60);
                        $total     = round($liters * $def['sell'], 2);
                        $paid      = ceil($total / 50) * 50;
                        $change    = round($paid - $total, 2);
                        $staffUser = $staff[mt_rand(0, count($staff) - 1)];

                        $saleId = DB::table('fuel_sales')->insertGetId([
                            'fuel_inventory_id' => $batches[$pid]['id'],
                            'recorded_by'       => $staffUser->id,
                            'sale_date'         => $saleAt,
                            'liters_sold'       => $liters,
                            'price_per_liter'   => $def['sell'],
                            'customer_name'     => $customerNames[mt_rand(0, count($customerNames) - 1)],
                            'created_at'        => $saleAt,
                            'updated_at'        => $saleAt,
                        ]);

                        DB::table('gasoline_payments')->insert([
                            'fuel_sale_id'   => $saleId,
                            'amount_paid'    => $paid,
                            'change_amount'  => $change,
                            'payment_method' => 'cash',
                            'status'         => 'paid',
                            'processed_by'   => $staffUser->id,
                            'created_at'     => $saleAt,
                            'updated_at'     => $saleAt,
                        ]);

                        DB::table('inventory_logs')->insert([
                            'fuel_inventory_id' => $batches[$pid]['id'],
                            'reference_id'      => $pid,
                            'movement'          => 'out',
                            'liters'            => $liters,
                            'liters_before'     => $stock[$pid],
                            'liters_after'      => $stock[$pid] - $liters,
                            'price_per_liter'   => $def['sell'],
                            'created_at'        => $saleAt,
                            'updated_at'        => $saleAt,
                        ]);

                        $stock[$pid]                -= $liters;
                        $batches[$pid]['remaining'] -= $liters;
                        $totalSales++;
                        $totalRevenue += $total;
                    }
                }
            }

            // Save the remaining liters of this month's batches
            foreach ($products as $pid => $def) {
                DB::table('fuel_inventory')
                    ->where('id', $batches[$pid]['id'])
                    ->update(['remaining_liters' => round($batches[$pid]['remaining'], 2)]);
            }
        }

        // Fresh delivery this month (walang benta pa) para may available stock sa dashboard
        $thisMonth = Carbon::now()->startOfMonth();
        foreach (array_keys($products) as $pid) {
            unset($batches[$pid]);
            $receive($thisMonth->copy()->setTime(8, 0), $pid);
            DB::table('fuel_inventory')
                ->where('id', $batches[$pid]['id'])
                ->update(['remaining_liters' => 5000]);
        }

        return ['sales' => $totalSales, 'revenue' => $totalRevenue];
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PARKING: customers, vehicles, completed bookings, transactions, payments
    // ═════════════════════════════════════════════════════════════════════════

    private function seedParkingHistory(User $admin, array $staff, array $slots, array $months): array
    {
        $now  = Carbon::now();
        $hash = Hash::make('password123');
        $rate = 200;

        $usableSlotIds = collect($slots)
            ->filter(fn ($s) => $s->status !== 'maintenance')
            ->pluck('id')
            ->all();

        // ─── Customers ───────────────────────────────────────────────────────
        $firstNames = ['Mark', 'Angelo', 'Rica', 'Joy', 'Carlo', 'Liza', 'Ben', 'Nina', 'Paolo', 'Grace', 'Dan', 'Mia', 'Rex', 'Ella', 'Vince'];
        $lastNames  = ['Villanueva', 'Aquino', 'Bautista', 'Mendoza', 'Ramos', 'Torres', 'Castillo', 'Navarro', 'Flores', 'Domingo', 'Salazar', 'Pascual', 'Cruz', 'Rivera', 'Soriano'];
        $models     = ['Toyota Vios', 'Honda City', 'Mitsubishi Mirage', 'Toyota Innova', 'Nissan Almera', 'Suzuki Ertiga', 'Ford Ranger', 'Hyundai Accent'];

        $registered = [];
        $walkIns    = [];
        $letters    = 'ABCDEFGHJKLMNPRSTUVWXYZ';

        foreach ($firstNames as $i => $fn) {
            $isRegistered = $i < 8;
            $phone        = '0917' . str_pad((string) (1000000 + $i), 7, '0', STR_PAD_LEFT);

            $user = User::create([
                'email'          => $isRegistered
                    ? strtolower($fn) . '.' . strtolower($lastNames[$i]) . '@example.com'
                    : $phone . '@guest.com',
                'password'       => $hash,
                'first_name'     => $fn,
                'last_name'      => $lastNames[$i],
                'phone_number'   => $phone,
                'address'        => 'Cagayan de Oro City',
                'role'           => 'customer',
                'customer_type'  => $isRegistered ? 'registered' : 'walk_in',
                'is_active'      => true,
                'email_verified' => true,
            ]);

            $plate = $letters[mt_rand(0, strlen($letters) - 1)]
                   . $letters[mt_rand(0, strlen($letters) - 1)]
                   . $letters[mt_rand(0, strlen($letters) - 1)]
                   . ' ' . mt_rand(1000, 9999);

            $vehicleId = DB::table('vehicles')->insertGetId([
                'customer_id'   => $user->id,
                'plate_number'  => $plate,
                'vehicle_model' => $models[mt_rand(0, count($models) - 1)],
                'created_at'    => $now,
                'updated_at'    => $now,
            ]);

            $row = ['user_id' => $user->id, 'vehicle_id' => $vehicleId];
            if ($isRegistered) {
                $registered[] = $row;
            } else {
                $walkIns[] = $row;
            }
        }

        // ─── Build booking specs for each month ──────────────────────────────
        $specs = [];
        foreach ($months as $start) {
            $dim   = $start->daysInMonth;
            $count = mt_rand(18, 24);

            for ($i = 0; $i < $count; $i++) {
                $nights = [1, 1, 2, 2, 3, 3, 4, 5][mt_rand(0, 7)];
                $day    = mt_rand(1, $dim - $nights); // checkout stays inside the same month

                $checkIn  = $start->copy()->addDays($day - 1)->setTime(14, 0);
                $checkOut = $checkIn->copy()->addDays($nights)->setTime(12, 0);

                $specs[] = [
                    'check_in'  => $checkIn,
                    'check_out' => $checkOut,
                    'nights'    => $nights,
                    'online'    => mt_rand(1, 100) <= 45,
                ];
            }
        }

        usort($specs, fn ($a, $b) => $a['check_in']->timestamp <=> $b['check_in']->timestamp);

        // ─── Insert bookings + transactions + payments ───────────────────────
        $busyUntil    = [];
        $totalRevenue = 0;
        $bookingCount = 0;

        foreach ($specs as $spec) {
            // hanap ng slot na libre sa buong stay
            $ids = $usableSlotIds;
            shuffle($ids);
            $slotId = null;
            foreach ($ids as $id) {
                if (! isset($busyUntil[$id]) || $busyUntil[$id]->lte($spec['check_in'])) {
                    $slotId = $id;
                    break;
                }
            }
            if (! $slotId) {
                continue;
            }
            $busyUntil[$slotId] = $spec['check_out'];

            $pool     = $spec['online'] ? $registered : $walkIns;
            $customer = $pool[mt_rand(0, count($pool) - 1)];
            $staffUser = $staff[mt_rand(0, count($staff) - 1)];
            $approver  = $spec['online'] ? $admin : $staffUser;

            $createdAt = $spec['online']
                ? $spec['check_in']->copy()->subDays(mt_rand(1, 3))->setTime(mt_rand(8, 20), mt_rand(0, 59))
                : $spec['check_in']->copy();

            $bookingId = DB::table('bookings')->insertGetId([
                'booking_type'    => $spec['online'] ? 'online' : 'walk_in',
                'customer_id'     => $customer['user_id'],
                'vehicle_id'      => $customer['vehicle_id'],
                'parking_slot_id' => $slotId,
                'check_in_date'   => $spec['check_in'],
                'check_out_date'  => $spec['check_out'],
                'status'          => 'completed',
                'confirm_by_id'   => $approver->id,
                'promo_id'        => null,
                'created_at'      => $createdAt,
                'updated_at'      => $spec['check_out'],
            ]);

            $txId = DB::table('parking_transactions')->insertGetId([
                'booking_id'     => $bookingId,
                'check_out_date' => $spec['check_out'],
                'checked_in_by'  => $staffUser->id,
                'created_at'     => $spec['check_in'],
                'updated_at'     => $spec['check_out'],
            ]);

            // Downpayment (GCash) para sa online bookings
            $downpayment = 0;
            if ($spec['online']) {
                $downpayment = 100;
                DB::table('parking_payments')->insert([
                    'parking_transaction_id'       => null,
                    'booking_id'                   => $bookingId,
                    'discount'                     => 0,
                    'amount_paid'                  => $downpayment,
                    'change_amount'                => 0,
                    'payment_method'               => 'gcash',
                    'reference_number'             => 'DP-' . $bookingId . '-SEED',
                    'status'                       => 'paid',
                    'processed_by'                 => null,
                    'paymongo_checkout_session_id' => 'cs_seed_' . $bookingId,
                    'paymongo_payment_id'          => 'pay_seed_' . $bookingId,
                    'paid_at'                      => $createdAt,
                    'created_at'                   => $createdAt,
                    'updated_at'                   => $createdAt,
                ]);
            }

            // Final payment sa checkout
            $total    = $spec['nights'] * $rate;
            $discount = mt_rand(1, 10) === 1 ? 20 : 0;
            $final    = max(0, $total - $downpayment - $discount);
            $paid     = $final > 0 ? (int) (ceil($final / 50) * 50) : 0;
            $change   = $paid - $final;
            $method   = mt_rand(1, 100) <= 75 ? 'cash' : 'gcash';

            DB::table('parking_payments')->insert([
                'parking_transaction_id' => $txId,
                'booking_id'             => null,
                'discount'               => $discount,
                'amount_paid'            => $paid,
                'change_amount'          => $change,
                'payment_method'         => $method,
                'reference_number'       => null,
                'status'                 => 'paid',
                'processed_by'           => $staffUser->id,
                'paid_at'                => $spec['check_out'],
                'created_at'             => $spec['check_out'],
                'updated_at'             => $spec['check_out'],
            ]);

            $totalRevenue += $final;
            $bookingCount++;
        }

        return ['bookings' => $bookingCount, 'revenue' => $totalRevenue];
    }
}