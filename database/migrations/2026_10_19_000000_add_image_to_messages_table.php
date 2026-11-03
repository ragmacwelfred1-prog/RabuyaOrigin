<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            // body becomes nullable (image-only messages have no text)
            $table->text('body')->nullable()->change();
            $table->string('image_path')->nullable()->after('body');
            $table->string('image_original_name')->nullable()->after('image_path');
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropColumn(['image_path', 'image_original_name']);
            $table->text('body')->nullable(false)->change();
        });
    }
};