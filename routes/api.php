
<?php

use App\Http\Controllers\API\AuthController;
use App\Http\Controllers\API\AdminProfileController;
use App\Http\Controllers\API\BookingCalendarController;
use App\Http\Controllers\API\ParkingCalendarController;
use App\Http\Controllers\API\AnalyticsController;
use App\Http\Controllers\API\StaffController;
use App\Http\Controllers\API\ParkingSlotController;
use App\Http\Controllers\API\ParkingController;
use App\Http\Controllers\API\FuelProductController;
use App\Http\Controllers\API\FuelSaleController;
use App\Http\Controllers\API\DashboardController;
use App\Http\Controllers\API\BookingController;
use App\Http\Controllers\API\AdminBookingController;
use App\Http\Controllers\API\ReportController;
use App\Http\Controllers\API\PromoController;
use App\Http\Controllers\API\FuelRemittanceController;
use App\Http\Controllers\API\ParkingRemittanceController;
use App\Http\Controllers\API\DownpaymentController;
use App\Http\Controllers\API\NotificationController;
use App\Http\Controllers\API\ChatController;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Broadcast;

// ─── PUBLIC ROUTES ────────────────────────────────────────────────────────────

// Admin login — 2-step (password → emailed OTP)
Route::post('/login', [AuthController::class, 'login'])
    ->middleware('throttle:10,1');
Route::post('/login/verify-otp', [AuthController::class, 'adminVerifyLoginOtp'])
    ->middleware('throttle:10,1');
Route::post('/login/resend-otp', [AuthController::class, 'adminResendLoginOtp'])
    ->middleware('throttle:5,1');

// Staff & customer login
Route::post('/staff/login', [AuthController::class, 'staffLogin'])
    ->middleware('throttle:10,1');
Route::post('/customer/login', [AuthController::class, 'customerLogin'])
    ->middleware('throttle:10,1');
Route::post('/customer/register', [AuthController::class, 'customerRegister'])
    ->middleware('throttle:10,1');

// Registration OTP
Route::post('/send-otp', [AuthController::class, 'sendOtp'])
    ->middleware('throttle:5,1');
Route::post('/verify-otp', [AuthController::class, 'verifyOtp'])
    ->middleware('throttle:10,1');

// ─── FORGOT PASSWORD ─────────────────────────────────────────────────────────
Route::post('/customer/forgot-password/send-otp', [AuthController::class, 'forgotPasswordSendOtp'])
    ->middleware('throttle:5,1');
Route::post('/customer/forgot-password/reset', [AuthController::class, 'forgotPasswordReset'])
    ->middleware('throttle:10,1');

Route::get('/parking-slots', [ParkingSlotController::class, 'index']);
Route::get('/slots/available', [ParkingSlotController::class, 'getAvailable']);

Route::get('/promos', [PromoController::class, 'index']);

Route::post('/paymongo/webhook', [DownpaymentController::class, 'webhook']);

// ─── PROTECTED ROUTES ────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {

    // ─── BROADCASTING AUTH ───────────────────────────────────────────────
    Route::post('/broadcasting/auth', function (\Illuminate\Http\Request $request) {
        return Broadcast::auth($request);
    });

    // AUTH / SESSION
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/staff/logout', [AuthController::class, 'staffLogout']);
    Route::get('/staff/me', [AuthController::class, 'staffMe']);

    // NOTIFICATIONS
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/poll', [NotificationController::class, 'poll']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::put('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::delete('/notifications', [NotificationController::class, 'destroyAll']);
    Route::put('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);
    Route::delete('/notifications/{id}', [NotificationController::class, 'destroy']);

    // ─── CHAT ROUTES ─────────────────────────────────────────────────────────
    Route::get('/chat/conversation', [ChatController::class, 'getOrCreateConversation']);
    Route::get('/chat/contacts', [ChatController::class, 'contacts']);
    Route::post('/chat/start', [ChatController::class, 'startWithContact']);
    Route::get('/chat/conversations', [ChatController::class, 'index']);
    Route::get('/chat/conversations/{id}/messages', [ChatController::class, 'messages']);
    Route::post('/chat/conversations/{id}/messages', [ChatController::class, 'send']);
    Route::get('/chat/unread-count', [ChatController::class, 'unreadCount']);

    // BOOKING CALENDAR
    Route::get('/customer/slots/{slotId}/booked-dates', [BookingCalendarController::class, 'getBookedDates']);
    Route::get('/customer/slots/booked-dates/all', [BookingCalendarController::class, 'getAllSlotsBookedDates']);
    Route::post('/customer/slots/check-availability', [BookingCalendarController::class, 'checkAvailability']);
    Route::get('/customer/slots/bookable', [BookingCalendarController::class, 'getBookableSlots']);

    // PARKING SLOTS
    Route::get('/parking-slots/available', [ParkingSlotController::class, 'getAvailable']);
    Route::post('/parking-slots', [ParkingSlotController::class, 'store']);
    Route::put('/parking-slots/{id}', [ParkingSlotController::class, 'update']);
    Route::delete('/parking-slots/{id}', [ParkingSlotController::class, 'destroy']);

    // SUPPLIERS
    Route::get('/suppliers', [FuelProductController::class, 'getSuppliers']);
    Route::post('/suppliers', [FuelProductController::class, 'storeSupplier']);
    Route::put('/suppliers/{id}', [FuelProductController::class, 'updateSupplier']);
    Route::delete('/suppliers/{id}', [FuelProductController::class, 'destroySupplier']);

    // FUEL PRODUCTS
    Route::get('/fuel-products', [FuelProductController::class, 'index']);
    Route::post('/fuel-products', [FuelProductController::class, 'store']);
    Route::put('/fuel-products/{id}', [FuelProductController::class, 'update']);
    Route::delete('/fuel-products/{id}', [FuelProductController::class, 'destroy']);

    // INVENTORY
    Route::get('/fuel/inventory', [FuelProductController::class, 'getInventory']);
    Route::post('/fuel/inventory/add', [FuelProductController::class, 'addInventory']);
    Route::post('/fuel/inventory/calculate-profit', [FuelProductController::class, 'calculateExpectedProfit']);

    // INVENTORY LOGS
    Route::get('/inventory-logs', [FuelProductController::class, 'getInventoryLogs']);
    Route::post('/inventory-logs', [FuelProductController::class, 'storeInventoryLog']);

    // DEBUG
    Route::get('/inventory-debug', [FuelProductController::class, 'debugInventory']);

    // FUEL SALES
    Route::get('/fuel/sales', [FuelSaleController::class, 'getAllSales']);
    Route::get('/fuel/sales/today', [FuelSaleController::class, 'getTodaySales']);
    Route::get('/fuel/daily-profit', [FuelSaleController::class, 'getDailyProfit']);
    Route::get('/fuel/stock-status', [FuelSaleController::class, 'getStockStatus']);
    Route::post('/fuel/sales', [FuelSaleController::class, 'recordSale']);

    // CUSTOMER SEARCH
    Route::get('/customers/search', [StaffController::class, 'searchCustomers']);

    // REPORTS
    Route::get('/reports/generate', [ReportController::class, 'generateReport']);
    Route::get('/reports/summary', [ReportController::class, 'getSummary']);

    // ─── STAFF ROUTES ────────────────────────────────────────────────────────
    Route::prefix('staff')->group(function () {
        Route::get('/parking/active', [ParkingController::class, 'getActive']);
        Route::get('/parking/history', [ParkingController::class, 'getHistory']);
        Route::get('/parking/today-checkins', [ParkingController::class, 'todayCheckins']);
        Route::post('/parking/checkin', [ParkingController::class, 'checkIn']);
        Route::post('/parking/checkin-existing', [ParkingController::class, 'checkInExisting']);
        Route::post('/parking/checkout/{id}', [ParkingController::class, 'checkOut']);

        // ✅ NEW: staff extension endpoint
        Route::post('/parking/extend/{id}', [ParkingController::class, 'extend']);

        Route::get('/remittances/check', [FuelRemittanceController::class, 'checkToday']);
        Route::get('/remittances/today-sales', [FuelRemittanceController::class, 'getTodaySalesTotal']);
        Route::post('/remittances', [FuelRemittanceController::class, 'store']);

        Route::get('/parking-remittances/check', [ParkingRemittanceController::class, 'checkToday']);
        Route::get('/parking-remittances/today-sales', [ParkingRemittanceController::class, 'getTodaySalesTotal']);
        Route::post('/parking-remittances', [ParkingRemittanceController::class, 'store']);

        Route::get('/bookings/pending', [AdminBookingController::class, 'getAllPendingBookings']);
    });

    // ─── CUSTOMER ROUTES ─────────────────────────────────────────────────────
    Route::prefix('customer')->group(function () {

        Route::post('/logout', [AuthController::class, 'customerLogout'])
            ->middleware('auth:sanctum');

        Route::middleware(['auth:sanctum', 'customer.active'])->group(function () {
            Route::get('/me', [AuthController::class, 'customerMe']);

            Route::get('/profile', [AuthController::class, 'customerProfile']);
            Route::put('/profile', [AuthController::class, 'updateCustomerProfile']);

            Route::get('/vehicles', [BookingController::class, 'myVehicles']);
            Route::post('/vehicles', [BookingController::class, 'addVehicle']);
            Route::put('/vehicles/{id}', [BookingController::class, 'updateVehicle']);
            Route::delete('/vehicles/{id}', [BookingController::class, 'deleteVehicle']);

            Route::get('/slots/available', [ParkingSlotController::class, 'getAvailable']);

            Route::get('/bookings', [BookingController::class, 'myBookings']);
            Route::post('/bookings', [BookingController::class, 'createBooking']);
            Route::get('/bookings/{id}', [BookingController::class, 'showBooking']);
            Route::post('/bookings/{id}/cancel', [BookingController::class, 'cancelBooking']);
            Route::delete('/bookings/{id}', [BookingController::class, 'cancelBooking']);
            Route::post('/bookings/{id}/checkin', [BookingController::class, 'checkIn']);
            Route::post('/bookings/{id}/downpayment', [DownpaymentController::class, 'createDownpayment']);
            Route::get('/bookings/{id}/downpayment/status', [DownpaymentController::class, 'downpaymentStatus']);

            // ✅ NEW: customer extension endpoint
            Route::post('/bookings/{id}/extend', [BookingController::class, 'extendBooking']);
        });
    });

    // ─── ADMIN ROUTES ────────────────────────────────────────────────────────
    Route::prefix('admin')->group(function () {

        Route::get('/analytics', [AnalyticsController::class, 'getAnalytics']);
        Route::get('/parking-calendar', [ParkingCalendarController::class, 'getCalendarData']);
        Route::get('/dashboard/stats', [DashboardController::class, 'getStats']);
        Route::get('/fuel-profit-summary', [DashboardController::class, 'getFuelProfitSummary']);

        Route::put('/profile', [AdminProfileController::class, 'update']);
        Route::post('/change-password', [AdminProfileController::class, 'changePassword']);

        Route::get('/parking-slots/{id}/details', [ParkingSlotController::class, 'details']);

        Route::get('/remittances', [FuelRemittanceController::class, 'index']);
        Route::get('/remittances/{id}', [FuelRemittanceController::class, 'show']);
        Route::patch('/remittances/{id}', [FuelRemittanceController::class, 'update']);

        Route::get('/parking-remittances', [ParkingRemittanceController::class, 'index']);
        Route::get('/parking-remittances/{id}', [ParkingRemittanceController::class, 'show']);
        Route::patch('/parking-remittances/{id}', [ParkingRemittanceController::class, 'update']);

        Route::get('/staff', [StaffController::class, 'index']);
        Route::post('/staff', [StaffController::class, 'store']);
        Route::put('/staff/{id}', [StaffController::class, 'update']);
        Route::delete('/staff/{id}', [StaffController::class, 'destroy']);

        Route::get('/bookings', [AdminBookingController::class, 'getAllBookings']);
        Route::get('/bookings/pending', [AdminBookingController::class, 'getAllPendingBookings']);
        Route::get('/bookings/{id}/downpayment', [DownpaymentController::class, 'adminDownpayment']);
        Route::post('/bookings/{id}/approve', [AdminBookingController::class, 'approveBooking']);
        Route::post('/bookings/{id}/reject', [AdminBookingController::class, 'rejectBooking']);
        Route::post('/bookings/{id}/cancel', [AdminBookingController::class, 'cancelBooking']);
        Route::post('/bookings/{id}/complete', [AdminBookingController::class, 'completeBooking']);
        Route::delete('/bookings/{id}', [AdminBookingController::class, 'deleteBooking']);

        Route::post('/parking/checkout/{id}', [ParkingController::class, 'checkOut']);

        Route::get('/customers', [AdminBookingController::class, 'getAllCustomers']);
        Route::get('/customers/{id}', [AdminBookingController::class, 'getCustomerDetails']);
        Route::put('/customers/{id}', [AdminBookingController::class, 'updateCustomer']);
        Route::patch('/customers/{id}/toggle-status', [AdminBookingController::class, 'toggleCustomerStatus']);
        Route::post('/customers/{id}/license', [AdminBookingController::class, 'uploadLicense']);
        Route::delete('/customers/{id}/license', [AdminBookingController::class, 'deleteLicensePhoto']);
        Route::get('/customers/stats', [AdminBookingController::class, 'getCustomerStats']);
        Route::get('/customers/export', [AdminBookingController::class, 'exportCustomers']);

        Route::get('/promos', [PromoController::class, 'index']);
        Route::post('/promos', [PromoController::class, 'store']);
        Route::put('/promos/{id}', [PromoController::class, 'update']);
        Route::delete('/promos/{id}', [PromoController::class, 'destroy']);
    });
});
