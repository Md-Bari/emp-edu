from django.urls import path

from .admin_api import (
    AccountDetailView, ActivityLogView, InstructorListView, OverviewView, PhotoImageView, PhotoListView,
    StudentListView,
)

urlpatterns = [
    path('overview/', OverviewView.as_view(), name='admin_overview'),
    path('instructors/', InstructorListView.as_view(), name='admin_instructors'),
    path('students/', StudentListView.as_view(), name='admin_students'),
    path('accounts/<int:user_id>/', AccountDetailView.as_view(), name='admin_account'),
    path('photos/', PhotoListView.as_view(), name='admin_photos'),
    path('photos/<int:photo_id>/image/', PhotoImageView.as_view(), name='admin_photo_image'),
    path('logs/', ActivityLogView.as_view(), name='admin_logs'),
]
