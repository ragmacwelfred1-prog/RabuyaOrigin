
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('parking_payments', function (Blueprint $table) {
            $table->id();

            $table->foreignId('parking_transaction_id')->nullable()->constrained('parking_transactions');
            $table->foreignId('booking_id')->nullable()->constrained('bookings')->nullOnDelete();

            $table->integer('discount')->default(0);
            $table->integer('amount_paid')->default(0);
            $table->integer('change_amount')->default(0);
            $table->enum('payment_method', ['cash', 'gcash'])->default('cash');
            

            $table->string('reference_number')->nullable();
            
            $table->enum('status', ['paid', 'unpaid'])->default('unpaid');

            $table->foreignId('processed_by')->nullable()->constrained('users');

            $table->string('paymongo_checkout_session_id')->nullable();
            $table->string('paymongo_payment_id')->nullable();
            $table->timestamp('paid_at')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('parking_payments');
    }
};
