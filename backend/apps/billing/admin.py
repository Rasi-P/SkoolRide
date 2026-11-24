from django.contrib import admin

from .models import FeePlan, Invoice, InvoiceLineItem, NumberSequence, Payment, PaymentAdjustment, PaymentAllocation, Receipt, StudentFeeAssignment

admin.site.register([FeePlan, StudentFeeAssignment, Invoice, InvoiceLineItem, Payment, PaymentAllocation, Receipt, PaymentAdjustment, NumberSequence])
