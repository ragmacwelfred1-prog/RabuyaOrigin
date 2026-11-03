
<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

// ─── Serve uploaded files (license photos, etc.) kahit walang storage:link
Route::get('/sfiles/{path}', function (string $path) {
    abort_if(str_contains($path, '..'), 404);

    $disk = Storage::disk('public');
    abort_unless($disk->exists($path), 404);

    return $disk->response($path);
})->where('path', '.*');

// ─── SPA catch-all (para sa React routes)
Route::get('/{any}', function () {
    return view('app');
})->where('any', '^(?!api|sfiles).*$');
