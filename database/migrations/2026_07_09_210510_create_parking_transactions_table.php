
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('parking_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings');
            $table->dateTime('check_out_date')->nullable();
            $table->foreignId('checked_in_by')->nullable()->constrained('users')->nullOnDelete(); // ✅ NANDITO NA
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('parking_transactions');
    }
};
