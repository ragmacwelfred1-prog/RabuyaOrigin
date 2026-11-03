
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->enum('booking_type', ['walk_in', 'online'])->default('online');
            $table->foreignId('customer_id')->nullable()->constrained('users');
            $table->foreignId('vehicle_id')->nullable()->constrained('vehicles');
            $table->foreignId('parking_slot_id')->constrained('parking_slots');
            $table->dateTime('check_in_date');
            $table->dateTime('check_out_date');
            $table->enum('status', ['pending', 'approved', 'rejected', 'completed', 'cancelled'])->default('pending');
            $table->foreignId('confirm_by_id')->nullable()->constrained('users');
            $table->foreignId('promo_id')->nullable()->constrained('promo')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bookings');
    }
};
