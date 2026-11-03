
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('fuel_sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fuel_inventory_id')->constrained('fuel_inventory');
            $table->foreignId('recorded_by')->constrained('users');
            $table->timestamp('sale_date')->useCurrent();
            $table->decimal('liters_sold', 10, 2);
            $table->decimal('price_per_liter', 10, 2);
            $table->string('customer_name')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fuel_sales');
    }
};
