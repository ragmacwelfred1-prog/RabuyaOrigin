<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private array $tables = ['fuel_remittances', 'parking_remittances'];

    public function up(): void
    {
        foreach ($this->tables as $t) {
            // Needed first: the unique index is what MySQL uses for the staff_id FK
            Schema::table($t, function (Blueprint $table) {
                $table->index('staff_id');
            });

            Schema::table($t, function (Blueprint $table) {
                $table->dropUnique(['staff_id', 'remittance_date']);
            });

            Schema::table($t, function (Blueprint $table) {
                $table->decimal('difference', 10, 2)->default(0)->after('actual_sales_amount');
                $table->foreignId('reviewed_by')->nullable()->after('status')
                    ->constrained('users')->nullOnDelete();
                $table->text('reject_reason')->nullable()->after('reviewed_by');
            });

            // backfill old rows
            DB::table($t)->update(['difference' => DB::raw('remitted_amount - actual_sales_amount')]);
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $t) {
            Schema::table($t, function (Blueprint $table) {
                $table->dropConstrainedForeignId('reviewed_by');
                $table->dropColumn(['difference', 'reject_reason']);
            });
            // NOTE: re-adding the unique key fails if duplicate (staff, date) rows already exist
            Schema::table($t, function (Blueprint $table) {
                $table->unique(['staff_id', 'remittance_date']);
            });
        }
    }
};