
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('fuel_remittances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('staff_id')->constrained('users');
            $table->date('remittance_date');
            $table->decimal('remitted_amount', 10, 2);
            $table->decimal('actual_sales_amount', 10, 2);
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->unique(['staff_id', 'remittance_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fuel_remittances');
    }
};
