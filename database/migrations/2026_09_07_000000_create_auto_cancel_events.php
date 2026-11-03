<?php
// database/migrations/2026_09_07_000000_create_auto_cancel_events.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // NOTE: `SET GLOBAL event_scheduler = ON` removed (needs SUPER, not
        // available on shared hosting). Verify with:
        //   SHOW VARIABLES LIKE 'event_scheduler';
        // If it is OFF, ask your host to enable it.

        DB::unprepared('DROP EVENT IF EXISTS auto_cancel_missed_bookings');

        DB::unprepared("
            CREATE EVENT auto_cancel_missed_bookings
            ON SCHEDULE EVERY 2 MINUTE
            STARTS CURRENT_TIMESTAMP
            ENABLE
            DO
            BEGIN
                -- 1. Snapshot the bookings to cancel, so every step below
                --    operates on exactly the same set of rows.
                DROP TEMPORARY TABLE IF EXISTS tmp_missed_bookings;

                CREATE TEMPORARY TABLE tmp_missed_bookings AS
                SELECT
                    b.id AS booking_id,
                    b.customer_id AS customer_id,
                    b.parking_slot_id AS parking_slot_id,
                    COALESCE(ps.slot_number, '') AS slot_number,
                    TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS customer_name
                FROM bookings b
                LEFT JOIN parking_transactions pt ON pt.booking_id = b.id
                LEFT JOIN parking_slots ps ON ps.id = b.parking_slot_id
                LEFT JOIN users u ON u.id = b.customer_id
                WHERE b.status = 'approved'
                    AND pt.id IS NULL
                    AND b.check_in_date <= DATE_SUB(NOW(), INTERVAL 10 MINUTE);

                -- 2. Notify customers
                INSERT INTO user_notifications
                    (user_id, title, message, type, data, created_at, updated_at)
                SELECT
                    m.customer_id,
                    '🕐 Booking Auto-Cancelled',
                    CONCAT('Your booking for Slot ', m.slot_number, ' was automatically cancelled because you did not check in within 10 minutes of the scheduled time.'),
                    'error',
                    JSON_OBJECT(
                        'booking_id', m.booking_id,
                        'slot', m.slot_number,
                        'category', 'booking',
                        'priority', 'high',
                        'reason', 'auto_cancel_missed_checkin'
                    ),
                    NOW(),
                    NOW()
                FROM tmp_missed_bookings m
                WHERE m.customer_id IS NOT NULL;

                -- 3. Notify all staff and admins
                INSERT INTO user_notifications
                    (user_id, title, message, type, data, created_at, updated_at)
                SELECT
                    s.id,
                    '🕐 Booking Auto-Cancelled',
                    CONCAT('Booking #', m.booking_id, ' for ', m.customer_name, ' (Slot ', m.slot_number, ') was auto-cancelled due to no-show.'),
                    'error',
                    JSON_OBJECT(
                        'booking_id', m.booking_id,
                        'customer', m.customer_name,
                        'slot', m.slot_number,
                        'category', 'booking',
                        'priority', 'high',
                        'reason', 'auto_cancel_missed_checkin'
                    ),
                    NOW(),
                    NOW()
                FROM tmp_missed_bookings m
                CROSS JOIN users s
                WHERE s.role IN ('admin', 'staff');

                -- 4. Release slots, only for the bookings in the snapshot
                UPDATE parking_slots ps
                INNER JOIN tmp_missed_bookings m ON m.parking_slot_id = ps.id
                SET ps.status = 'available'
                WHERE ps.status = 'occupied';

                -- 5. Cancel the bookings (status re-checked in case it changed meanwhile)
                UPDATE bookings b
                INNER JOIN tmp_missed_bookings m ON m.booking_id = b.id
                SET b.status = 'cancelled',
                    b.updated_at = NOW()
                WHERE b.status = 'approved';

                DROP TEMPORARY TABLE IF EXISTS tmp_missed_bookings;
            END
        ");
    }

    public function down(): void
    {
        DB::unprepared('DROP EVENT IF EXISTS auto_cancel_missed_bookings');
    }
};