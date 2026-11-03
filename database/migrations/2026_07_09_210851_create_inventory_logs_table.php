
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('inventory_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fuel_inventory_id')->constrained('fuel_inventory')->onDelete('cascade');
            $table->unsignedBigInteger('reference_id');
            $table->enum('movement', ['in', 'out']);
            $table->decimal('liters', 10, 2);
            $table->decimal('liters_before', 10, 2);
            $table->decimal('liters_after', 10, 2);
            $table->decimal('price_per_liter', 10, 2);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_logs');
    }
};
