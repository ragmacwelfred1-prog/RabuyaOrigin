
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('parking_slots', function (Blueprint $table) {
            $table->id();
            $table->string('slot_number')->unique();
            $table->enum('status', ['available', 'occupied', 'maintenance'])->default('available');
            $table->decimal('nightly_rate', 10, 2)->default(250);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('parking_slots');
    }
};
