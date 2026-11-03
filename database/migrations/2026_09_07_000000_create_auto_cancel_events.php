
<?php
// database/migrations/2026_09_07_000000_create_auto_cancel_events.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Enable event scheduler
        DB::statement('SET GLOBAL event_scheduler = ON');

        // Drop existing event if it exists
        DB::statement('DROP EVENT IF EXISTS auto_cancel_missed_bookings');

        // Create event with notification support
        DB::statement("
            CREATE EVENT auto_cancel_missed_bookings
            ON SCHEDULE EVERY 2 MINUTE
            STARTS CURRENT_TIMESTAMP
            ENABLE
            DO
            BEGIN
                DECLARE done INT DEFAULT FALSE;
                DECLARE booking_id INT;
                DECLARE customer_id INT;
                DECLARE slot_number VARCHAR(50);
                DECLARE customer_name VARCHAR(255);
                DECLARE cur CURSOR FOR 
                    SELECT 
                        b.id,
                        b.customer_id,
                        ps.slot_number,
                        CONCAT(u.first_name, ' ', u.last_name) as customer_name
                    FROM bookings b
                    LEFT JOIN parking_transactions pt ON pt.booking_id = b.id
                    LEFT JOIN parking_slots ps ON ps.id = b.parking_slot_id
                    LEFT JOIN users u ON u.id = b.customer_id
                    WHERE b.status = 'approved'
                        AND pt.id IS NULL
                        AND b.check_in_date <= DATE_SUB(NOW(), INTERVAL 10 MINUTE);
                
                DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

                -- Cancel bookings and release slots
                UPDATE bookings b
                LEFT JOIN parking_transactions pt ON pt.booking_id = b.id
                SET b.status = 'cancelled',
                    b.updated_at = NOW()
                WHERE b.status = 'approved'
                    AND pt.id IS NULL
                    AND b.check_in_date <= DATE_SUB(NOW(), INTERVAL 10 MINUTE);

                -- Release parking slots
                UPDATE parking_slots ps
                INNER JOIN bookings b ON b.parking_slot_id = ps.id
                SET ps.status = 'available'
                WHERE b.status = 'cancelled'
                    AND ps.status = 'occupied'
                    AND b.check_in_date <= DATE_SUB(NOW(), INTERVAL 10 MINUTE);

                -- ─── CREATE NOTIFICATIONS FOR AUTO-CANCELLED BOOKINGS ───

                OPEN cur;

                read_loop: LOOP
                    FETCH cur INTO booking_id, customer_id, slot_number, customer_name;
                    IF done THEN
                        LEAVE read_loop;
                    END IF;

                    -- Insert notification for customer
                    IF customer_id IS NOT NULL THEN
                        INSERT INTO user_notifications (
                            user_id,
                            title,
                            message,
                            type,
                            data,
                            created_at,
                            updated_at
                        ) VALUES (
                            customer_id,
                            '🕐 Booking Auto-Cancelled',
                            CONCAT('Your booking for Slot ', slot_number, ' was automatically cancelled because you did not check in within 10 minutes of the scheduled time.'),
                            'error',
                            JSON_OBJECT(
                                'booking_id', booking_id,
                                'slot', slot_number,
                                'category', 'booking',
                                'priority', 'high',
                                'reason', 'auto_cancel_missed_checkin'
                            ),
                            NOW(),
                            NOW()
                        );
                    END IF;

                    -- Insert notification for all staff and admins
                    INSERT INTO user_notifications (
                        user_id,
                        title,
                        message,
                        type,
                        data,
                        created_at,
                        updated_at
                    )
                    SELECT 
                        u.id,
                        '🕐 Booking Auto-Cancelled',
                        CONCAT('Booking #', booking_id, ' for ', customer_name, ' (Slot ', slot_number, ') was auto-cancelled due to no-show.'),
                        'error',
                        JSON_OBJECT(
                            'booking_id', booking_id,
                            'customer', customer_name,
                            'slot', slot_number,
                            'category', 'booking',
                            'priority', 'high',
                            'reason', 'auto_cancel_missed_checkin'
                        ),
                        NOW(),
                        NOW()
                    FROM users u
                    WHERE u.role IN ('admin', 'staff');

                END LOOP;

                CLOSE cur;
            END
        ");
    }

    public function down(): void
    {
        DB::statement('DROP EVENT IF EXISTS auto_cancel_missed_bookings');
    }
};

