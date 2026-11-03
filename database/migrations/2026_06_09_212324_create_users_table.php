
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('email')->unique();
            $table->string('password')->nullable();
            $table->string('first_name');
            $table->string('middle_name')->nullable();
            $table->string('last_name');
            $table->string('phone_number')->nullable();
            $table->text('address')->nullable();
             $table->string('license_number')->nullable();
            $table->enum('license_type', ['professional', 'non_professional', 'student'])->nullable();
            $table->date('license_expiration')->nullable();
            $table->string('license_photo')->nullable();
            $table->string('license_photo_original_name')->nullable();
            $table->enum('role', ['admin', 'staff', 'customer'])->default('customer');
            $table->enum('customer_type', ['walk_in', 'registered'])->nullable();
            $table->string('employee_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('email_verified')->default(false);
            $table->rememberToken();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
