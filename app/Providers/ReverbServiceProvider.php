<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class ReverbServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // NOTE: the broadcasting auth route (/api/broadcasting/auth) is
        // already registered manually in routes/api.php. Do NOT also call
        // Broadcast::routes() here — registering it twice creates two
        // competing route definitions for the same URI, which is
        // unreliable and was likely contributing to the 401s.

        // Channel authorization callbacks (Broadcast::channel(...) definitions)
        require base_path('routes/channels.php');
    }
}