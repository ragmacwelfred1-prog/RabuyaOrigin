<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            // Idagdag muna ang composite unique (nagsisilbing index ng customer_id FK)
            $table->unique(['customer_id', 'staff_id'], 'conversations_customer_staff_unique');
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->dropUnique('conversations_customer_id_unique');
        });
    }

    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->unique('customer_id');
        });
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropUnique('conversations_customer_staff_unique');
        });
    }
};