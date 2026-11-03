<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureCustomerActive
{
    /**
     * Blocks any authenticated request from a customer whose account
     * has been deactivated by an admin. Revokes the current token so
     * the mobile app is forced to log out and return to the login screen.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->role === 'customer' && ! $user->is_active) {
            // Kill the token being used right now
            $token = $user->currentAccessToken();
            if ($token) {
                $token->delete();
            }

            return response()->json([
                'success'   => false,
                'message'   => 'Your account has been deactivated. Please contact support.',
                'deactivated' => true,
            ], 403);
        }

        return $next($request);
    }
}