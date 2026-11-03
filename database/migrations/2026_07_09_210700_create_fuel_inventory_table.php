
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('fuel_inventory', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fuel_product_id')->constrained('fuel_products');
            $table->foreignId('supplier_id')->constrained('suppliers');
            $table->date('delivery_date');
            $table->decimal('liters_delivered', 10, 2);
            $table->decimal('remaining_liters', 10, 2);
            $table->decimal('cost_price_per_liter', 10, 2);
            $table->decimal('selling_price_per_liter', 10, 2);
            $table->string('reference_no', 100)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fuel_inventory');
    }
};
