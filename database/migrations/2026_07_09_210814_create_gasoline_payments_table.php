
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('gasoline_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fuel_sale_id')->constrained('fuel_sales');
            $table->decimal('amount_paid', 10, 2)->default(0.00);
            $table->decimal('change_amount', 10, 2)->default(0.00);
            $table->enum('payment_method', ['cash'])->default('cash');
            $table->enum('status', ['paid', 'unpaid'])->default('unpaid');
            $table->foreignId('processed_by')->constrained('users');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gasoline_payments');
    }
};
